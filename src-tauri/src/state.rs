use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::models::{TickPayload, WifiInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub refresh_ms: u64,
    pub quota_gb: f64,
    pub reset_day: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            refresh_ms: 1000,
            quota_gb: 0.0,
            reset_day: 1,
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
}
