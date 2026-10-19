use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::tray::TrayIcon;

use crate::lan::LanServer;
use crate::models::{TickPayload, WifiInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub refresh_ms: u64,
    pub quota_gb: f64,
    pub reset_day: u32,
    pub minimize_to_tray: bool,
    pub auto_check_updates: bool,
    /// Price of one GB of data. `0` disables every money figure in the app.
    pub rate_per_gb: f64,
    pub currency: String,
    pub speedtest_enabled: bool,
    pub lan_enabled: bool,
    /// Path token for the LAN dashboard; any request without it is refused.
    pub lan_token: String,
    /// Days of per-minute history before samples fold into hourly totals.
    /// `0` keeps every minute forever.
    pub retention_days: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            refresh_ms: 1000,
            quota_gb: 0.0,
            reset_day: 1,
            minimize_to_tray: false,
            auto_check_updates: true,
            rate_per_gb: 0.0,
            currency: "PKR".to_string(),
            speedtest_enabled: false,
            lan_enabled: false,
            lan_token: String::new(),
            retention_days: 0,
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct SessionAccum {
    pub rx: u64,
    pub tx: u64,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub config: Mutex<Config>,
    pub latest: Mutex<TickPayload>,
    pub session: Mutex<SessionAccum>,
    pub wifi: Mutex<Option<WifiInfo>>,
    pub acc: Mutex<HashMap<String, (u64, u64)>>,
    pub totals: Mutex<HashMap<String, (u64, u64)>>,
    pub db_path: String,
    pub tray: Mutex<Option<TrayIcon>>,
    pub lan: Mutex<Option<LanServer>>,
}
