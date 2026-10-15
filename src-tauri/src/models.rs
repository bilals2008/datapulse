use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSnapshot {
    pub name: String,
    pub is_wireless: bool,
    pub rx_rate: f64,
    pub tx_rate: f64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TickPayload {
    pub ts: i64,
    pub interfaces: Vec<InterfaceSnapshot>,
    pub rx_rate: f64,
    pub tx_rate: f64,
    pub session_rx: u64,
    pub session_tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBucket {
    pub key: String,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSeries {
    pub range: String,
    pub buckets: Vec<UsageBucket>,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceTotal {
    pub name: String,
    pub is_wireless: bool,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForecastPoint {
    pub ts: i64,
    pub actual: u64,
    pub projected: u64,
    pub budget: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaStatus {
    pub enabled: bool,
    pub limit_bytes: u64,
    pub used_bytes: u64,
    pub projected_bytes: u64,
    pub period_start: i64,
    pub period_end: i64,
    pub days_elapsed: f64,
    pub days_total: f64,
    pub reset_day: u32,
    pub avg_daily: u64,
    pub daily_budget: u64,
    pub forecast_bytes: u64,
    pub days_to_limit: f64,
    pub over_budget: bool,
    pub burn: Vec<ForecastPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiInfo {
    pub ssid: String,
    pub signal_percent: u32,
    pub radio_type: String,
    pub channel: String,
    pub rx_mbps: f64,
    pub tx_mbps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anomaly {
    pub id: i64,
    pub kind: String,
    pub ts: i64,
    pub iface: String,
    pub bytes: u64,
    pub baseline: u64,
    pub ratio: f64,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineBucket {
    pub ts: i64,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub start: i64,
    pub end: i64,
    pub resolution: i64,
    pub rx: u64,
    pub tx: u64,
    pub buckets: Vec<TimelineBucket>,
    pub interfaces: Vec<InterfaceTotal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMeta {
    pub version: String,
    pub db_path: String,
    pub platform: String,
}
