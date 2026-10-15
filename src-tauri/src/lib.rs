use std::sync::{Arc, Mutex};

use tauri::Manager;

mod collector;
mod commands;
mod db;
mod error;
mod models;
mod net;
mod state;
mod wifi;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
