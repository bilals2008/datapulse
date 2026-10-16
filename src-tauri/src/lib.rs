use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindow, Window, WindowEvent,
};

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

use state::AppState;

/// Remembers when the popover auto-hid on focus loss so a tray click that
/// caused that blur does not immediately reopen it.
static POPOVER_HIDDEN_AT: Mutex<Option<Instant>> = Mutex::new(None);

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
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
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DataPulse")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
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

            let config = state.config.lock().unwrap().clone();
            if config.lan_enabled {
                commands::apply_lan(&state, &config);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_main_window,
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
