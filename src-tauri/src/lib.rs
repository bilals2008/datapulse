use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::Monitor,
    Emitter, Manager, PhysicalPosition, WebviewWindow, Window, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod analytics;
mod collector;
mod commands;
mod db;
mod error;
mod hud;
mod lan;
mod models;
mod net;
mod procs;
mod speed;
mod state;
mod wifi;

use models::TinyState;
use state::AppState;

/// Remembers when the popover auto-hid on focus loss so a tray click that
/// caused that blur does not immediately reopen it.
static POPOVER_HIDDEN_AT: Mutex<Option<Instant>> = Mutex::new(None);
/// The main window starts hidden behind the splash; whoever reveals it first wins.
static BOOT_REVEALED: AtomicBool = AtomicBool::new(false);

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Called by the frontend once the first real frame is up: the main window
/// appears behind the splash, which fades out and is destroyed.
#[tauri::command]
fn finish_boot(app: tauri::AppHandle) {
    if BOOT_REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    show_main_window(&app);
    let _ = app.emit_to("splash", "splash-fade", ());

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(240));
        if let Some(splash) = handle.get_webview_window("splash") {
            let _ = splash.destroy();
        }
    });
}

fn minimize_to_tray_enabled(app: &tauri::AppHandle) -> bool {
    app.try_state::<Arc<AppState>>()
        .map(|state| state.config.lock().unwrap().minimize_to_tray)
        .unwrap_or(false)
}

fn toggle_popover(app: &tauri::AppHandle, anchor: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window("popover") else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    if let Some(hidden_at) = *POPOVER_HIDDEN_AT.lock().unwrap() {
        if hidden_at.elapsed() < Duration::from_millis(250) {
            return;
        }
    }

    position_popover(&window, anchor);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Anchors the popover above the tray icon, clamped to the monitor work area.
fn position_popover(window: &WebviewWindow, anchor: PhysicalPosition<f64>) {
    let Ok(size) = window.outer_size() else {
        return;
    };

    let monitor = window
        .monitor_from_point(anchor.x, anchor.y)
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let margin = 8.0;
    let mut x = anchor.x - size.width as f64 / 2.0;
    let mut y = anchor.y - size.height as f64 - margin;

    if let Some(monitor) = monitor {
        let origin = monitor.position();
        let extent = monitor.size();
        let min_x = origin.x as f64 + margin;
        let min_y = origin.y as f64 + margin;
        let max_x = origin.x as f64 + extent.width as f64 - size.width as f64 - margin;
        let max_y = origin.y as f64 + extent.height as f64 - size.height as f64 - margin;
        x = x.clamp(min_x, max_x.max(min_x));
        y = y.clamp(min_y, max_y.max(min_y));
    }

    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
}

/// Bound as the global shortcut until the user picks another one in Settings.
/// Parsing is case-insensitive.
const TINY_HOTKEY: &str = "Ctrl+Alt+D";
/// Gap the docked HUD keeps from the screen edge.
const TINY_MARGIN: i32 = 12;

/// Screen rectangle the HUD is allowed to sit in.
#[derive(Clone, Copy)]
struct Area {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

fn area_of(monitor: &Monitor) -> Area {
    let rect = monitor.work_area();
    Area {
        left: rect.position.x,
        top: rect.position.y,
        right: rect.position.x + rect.size.width as i32,
        bottom: rect.position.y + rect.size.height as i32,
    }
}

/// Work area of the monitor holding a point, falling back to the HUD's own
/// monitor. Resolving through the point keeps a docked HUD on its own screen
/// even when the window is created on the primary one at startup.
fn area_at(window: &WebviewWindow, x: i32, y: i32) -> Option<Area> {
    window
        .monitor_from_point(x as f64, y as f64)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .map(|monitor| area_of(&monitor))
}

fn clamp_axis(value: i32, min: i32, max: i32) -> i32 {
    value.clamp(min, max.max(min))
}

/// Docks the HUD flush to the nearest edge of `area`, one margin inside it,
/// leaving its position along that edge alone. Already docked positions map to
/// themselves, so re-running this cannot oscillate.
fn dock_position(x: i32, y: i32, width: i32, height: i32, area: Area) -> (i32, i32) {
    let min_x = area.left + TINY_MARGIN;
    let max_x = area.right - width - TINY_MARGIN;
    let min_y = area.top + TINY_MARGIN;
    let max_y = area.bottom - height - TINY_MARGIN;

    let edges = [
        x - area.left,
        area.right - (x + width),
        y - area.top,
        area.bottom - (y + height),
    ];
    let nearest = (0..edges.len())
        .min_by_key(|index| edges[*index])
        .unwrap_or(0);

    let mut nx = clamp_axis(x, min_x, max_x);
    let mut ny = clamp_axis(y, min_y, max_y);
    match nearest {
        0 => nx = min_x,
        1 => nx = max_x,
        2 => ny = min_y,
        _ => ny = max_y,
    }
    (nx, ny)
}

/// Puts the HUD on its saved spot, or the top-right corner of the monitor it
/// was created on when it has none.
fn place_tiny(window: &WebviewWindow, saved: Option<(i32, i32)>) {
    let Ok(size) = window.outer_size() else {
        return;
    };
    let (width, height) = (size.width as i32, size.height as i32);

    let anchor = saved.or_else(|| window.outer_position().ok().map(|spot| (spot.x, spot.y)));
    let Some(area) = anchor.and_then(|(x, y)| area_at(window, x, y)) else {
        return;
    };

    let (x, y) = saved.unwrap_or((
        area.right - width - TINY_MARGIN,
        area.top + TINY_MARGIN,
    ));

    let _ = window.set_position(PhysicalPosition::new(
        clamp_axis(x, area.left + TINY_MARGIN, area.right - width - TINY_MARGIN),
        clamp_axis(y, area.top + TINY_MARGIN, area.bottom - height - TINY_MARGIN),
    ));
}

fn tiny_setting(state: &Arc<AppState>, key: &str) -> Option<String> {
    let conn = state.db.lock().unwrap();
    db::get_setting(&conn, key)
}

fn tiny_position(state: &Arc<AppState>) -> Option<(i32, i32)> {
    let x = tiny_setting(state, "tiny_x")?.parse().ok()?;
    let y = tiny_setting(state, "tiny_y")?.parse().ok()?;
    Some((x, y))
}

fn tiny_visible(state: &Arc<AppState>) -> bool {
    tiny_setting(state, "tiny_visible").as_deref() == Some("true")
}

fn tiny_hotkey(state: &Arc<AppState>) -> String {
    tiny_setting(state, "tiny_hotkey")
        .filter(|chord| !chord.trim().is_empty())
        .unwrap_or_else(|| TINY_HOTKEY.to_string())
}

fn save_tiny(state: &Arc<AppState>, key: &str, value: &str) {
    let conn = state.db.lock().unwrap();
    let _ = db::set_setting(&conn, key, value);
}

/// Shows or hides the HUD, remembers the choice for the next launch, and puts it
/// back on its docked spot (or a visible one after its monitor changed).
fn apply_tiny(app: &tauri::AppHandle, state: &Arc<AppState>, visible: bool) {
    let Some(window) = app.get_webview_window("tiny") else {
        return;
    };

    if visible {
        place_tiny(&window, tiny_position(state));
        let _ = window.show();
    } else {
        let _ = window.hide();
    }
    save_tiny(state, "tiny_visible", if visible { "true" } else { "false" });
}

fn toggle_tiny(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };
    apply_tiny(app, state.inner(), !tiny_visible(state.inner()));
}

/// Docks the HUD to its nearest screen edge after a drag and remembers where it
/// landed.
#[tauri::command]
fn snap_tiny(app: tauri::AppHandle, state: tauri::State<'_, Arc<AppState>>) {
    let Some(window) = app.get_webview_window("tiny") else {
        return;
    };
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let (width, height) = (size.width as i32, size.height as i32);
    // The middle point decides which monitor a straddling HUD belongs to.
    let Some(area) = area_at(&window, position.x + width / 2, position.y + height / 2) else {
        return;
    };

    let (x, y) = dock_position(position.x, position.y, width, height, area);
    if (x, y) != (position.x, position.y) {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }

    save_tiny(state.inner(), "tiny_x", &x.to_string());
    save_tiny(state.inner(), "tiny_y", &y.to_string());
}

#[tauri::command]
fn get_tiny_state(state: tauri::State<'_, Arc<AppState>>) -> TinyState {
    TinyState {
        visible: tiny_visible(state.inner()),
        hotkey: tiny_hotkey(state.inner()),
    }
}

#[tauri::command]
fn set_tiny_visible(app: tauri::AppHandle, state: tauri::State<'_, Arc<AppState>>, visible: bool) {
    apply_tiny(&app, state.inner(), visible);
}

/// Rebinds the show/hide shortcut. A chord another app already owns is refused,
/// and the previous one is put back.
#[tauri::command]
fn set_tiny_hotkey(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    hotkey: String,
) -> Result<String, String> {
    let chord = hotkey.trim().to_string();
    if chord.is_empty() {
        return Err("Enter a shortcut such as Ctrl+Alt+D".to_string());
    }

    let shortcuts = app.global_shortcut();
    let previous = tiny_hotkey(state.inner());
    let _ = shortcuts.unregister_all();
    if shortcuts.register(chord.as_str()).is_err() {
        let _ = shortcuts.register(previous.as_str());
        return Err("That shortcut is already taken".to_string());
    }

    save_tiny(state.inner(), "tiny_hotkey", &chord);
    Ok(chord)
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    match window.label() {
        "main" => match event {
            WindowEvent::CloseRequested { api, .. } => {
                if minimize_to_tray_enabled(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            WindowEvent::Resized(_) => {
                if minimize_to_tray_enabled(window.app_handle())
                    && window.is_minimized().unwrap_or(false)
                {
                    let _ = window.hide();
                }
            }
            _ => {}
        },
        "popover" => match event {
            WindowEvent::Focused(false) => {
                if window.is_visible().unwrap_or(false) {
                    *POPOVER_HIDDEN_AT.lock().unwrap() = Some(Instant::now());
                    let _ = window.hide();
                }
            }
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        },
        "tiny" => {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        }
        "splash" => {
            // The main window is still hidden, so a user close quits instead.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.app_handle().exit(0);
            }
        }
        _ => {}
    }
}

#[tauri::command]
fn open_main_window(app: tauri::AppHandle) {
    show_main_window(&app);
    if let Some(popover) = app.get_webview_window("popover") {
        let _ = popover.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_tiny(app);
                    }
                })
                .build(),
        )
        .on_window_event(handle_window_event)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("usage.db");
            let db_path_str = db_path.to_string_lossy().to_string();

            let conn = db::open(&db_path)?;
            let config = db::load_config(&conn)?;

            let state = Arc::new(AppState {
                db: Mutex::new(conn),
                config: Mutex::new(config),
                latest: Mutex::new(Default::default()),
                session: Mutex::new(Default::default()),
                wifi: Mutex::new(None),
                acc: Mutex::new(Default::default()),
                totals: Mutex::new(Default::default()),
                db_path: db_path_str,
                tray: Mutex::new(None),
                lan: Mutex::new(None),
            });

            app.manage(state.clone());
            collector::spawn(app.handle().clone(), state.clone());
            speed::spawn(app.handle().clone(), state.clone());

            let show_item = MenuItem::with_id(app, "show", "Show DataPulse", true, None::<&str>)?;
            let tiny_item = MenuItem::with_id(app, "tiny", "Tiny HUD", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &tiny_item, &quit_item])?;

            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DataPulse")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "tiny" => toggle_tiny(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        toggle_popover(tray.app_handle(), position);
                    }
                })
                .build(app)?;

            *state.tray.lock().unwrap() = Some(tray);

            // The chord is a setting, so it is bound here rather than in the
            // plugin; a chord another app owns leaves the tray item as the way in.
            let hotkey = tiny_hotkey(&state);
            let _ = app.handle().global_shortcut().register(hotkey.as_str());
            if tiny_visible(&state) {
                apply_tiny(app.handle(), &state, true);
            }

            let config = state.config.lock().unwrap().clone();
            if config.lan_enabled {
                commands::apply_lan(&state, &config);
            }

            // A frontend that never signals must not leave the app behind the splash.
            let rescue = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(6));
                if BOOT_REVEALED.swap(true, Ordering::SeqCst) {
                    return;
                }
                if let Some(splash) = rescue.get_webview_window("splash") {
                    let _ = splash.destroy();
                }
                show_main_window(&rescue);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_main_window,
            finish_boot,
            snap_tiny,
            get_tiny_state,
            set_tiny_visible,
            set_tiny_hotkey,
            commands::get_snapshot,
            commands::get_settings,
            commands::set_settings,
            commands::get_usage_series,
            commands::get_interface_totals,
            commands::get_quota_status,
            commands::get_wifi_info,
            commands::get_app_meta,
            commands::clear_history,
            commands::get_anomalies,
            commands::dismiss_anomaly,
            commands::dismiss_all_anomalies,
            commands::get_timeline,
            commands::get_daily_activity,
            commands::get_recap,
            commands::get_wrapped,
            commands::save_wrapped_png,
            commands::get_free_window,
            commands::get_speed_report,
            commands::run_speedtest,
            commands::get_lan_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Arc<AppState>>() {
                collector::flush(&state);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Area = Area {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1040,
    };

    #[test]
    fn dock_snaps_to_the_nearest_edge() {
        // Equidistant from the left and top edges: left wins the tie.
        assert_eq!(dock_position(100, 100, 200, 60, AREA), (12, 100));
        assert_eq!(dock_position(1700, 500, 200, 60, AREA), (1708, 500));
        assert_eq!(dock_position(900, 990, 200, 60, AREA), (900, 968));
        // A drag past the screen lands back inside it.
        assert_eq!(dock_position(-400, -80, 200, 60, AREA), (12, 12));
    }

    #[test]
    fn docking_twice_changes_nothing() {
        let once = dock_position(100, 700, 200, 60, AREA);
        assert_eq!(once, (12, 700));
        assert_eq!(dock_position(once.0, once.1, 200, 60, AREA), once);
    }
}
