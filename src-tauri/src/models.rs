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
    /// Busiest processes at the moment the spike was recorded.
    pub procs: Vec<ProcessSample>,
}

/// One process captured while an anomaly was being recorded. This is a hint,
/// not measured per-process traffic: the OS does not attribute bytes per
/// process without an ETW/admin session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSample {
    pub name: String,
    pub cpu: f64,
    pub disk_written: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HourBytes {
    pub hour: u32,
    pub bytes: u64,
}

/// The quietest stretch of the day, plus what it means for the current cap.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeWindow {
    pub start_hour: u32,
    pub end_hour: u32,
    /// Average transfer per hour inside the window.
    pub window_bytes: u64,
    /// Average transfer per hour across the whole day.
    pub day_bytes: u64,
    pub busiest_hour: Option<u32>,
    pub advice: String,
    pub hours: Vec<HourBytes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub ts: i64,
    pub down_bps: f64,
    pub latency_ms: f64,
    pub bytes: u64,
    pub ok: bool,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedHour {
    pub hour: u32,
    pub mbps: f64,
    pub samples: u32,
}

/// Throughput observed by the built-in speed test, grouped by local hour.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedReport {
    pub enabled: bool,
    pub latest: Option<SpeedSample>,
    pub best: Option<SpeedHour>,
    pub worst: Option<SpeedHour>,
    pub by_hour: Vec<SpeedHour>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanInfo {
    pub enabled: bool,
    /// `false` while enabled but the port is taken or the host has no LAN address.
    pub running: bool,
    pub url: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTotal {
    pub day: String,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusiestDay {
    pub day: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recap {
    pub this_week: u64,
    pub last_week: u64,
    pub delta_percent: f64,
    pub avg_daily: u64,
    pub busiest_day: Option<BusiestDay>,
    /// Local hour of day (0–23) with the most transfer this week.
    pub busiest_hour: Option<u32>,
    pub top_interface: Option<InterfaceTotal>,
}
