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
mod models;
mod net;
mod state;
mod wifi;

use state::AppState;

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

fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }

    match event {
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
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            });

            app.manage(state.clone());
            collector::spawn(app.handle().clone(), state);

            let show_item = MenuItem::with_id(app, "show", "Show DataPulse", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("main-tray")
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
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
