use chrono::{Datelike, Duration as ChronoDuration, Local, TimeZone, Timelike};
use std::sync::Arc;
use tauri::State;

use crate::error::AppError;
use crate::models::{
    AppMeta, InterfaceTotal, QuotaStatus, TickPayload, UsageBucket, UsageSeries,
};
use crate::state::{AppState, Config};
use crate::{db, net};

type Res<T> = Result<T, AppError>;

#[tauri::command]
pub fn get_snapshot(state: State<'_, Arc<AppState>>) -> Res<TickPayload> {
    Ok(state.latest.lock().unwrap().clone())
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Res<Config> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
pub fn set_settings(state: State<'_, Arc<AppState>>, config: Config) -> Res<Config> {
    let mut next = config;
    next.refresh_ms = next.refresh_ms.clamp(500, 10_000);
    next.reset_day = next.reset_day.clamp(1, 28);
    if !next.quota_gb.is_finite() || next.quota_gb < 0.0 {
        next.quota_gb = 0.0;
    }

    {
        let conn = state.db.lock().unwrap();
        db::save_config(&conn, &next)?;
    }

    *state.config.lock().unwrap() = next.clone();
    Ok(next)
}

#[tauri::command]
pub fn get_usage_series(state: State<'_, Arc<AppState>>, range: String) -> Res<UsageSeries> {
    let plan = plan_series(&range);
    let conn = state.db.lock().unwrap();
    let map = db::series(&conn, plan.format, plan.since, tz_offset_secs())?;

    let mut buckets = Vec::with_capacity(plan.keys.len());
    let mut rx_total = 0_u64;
    let mut tx_total = 0_u64;

    for key in plan.keys {
        let (rx, tx) = map.get(&key).copied().unwrap_or((0, 0));
        rx_total += rx;
        tx_total += tx;
        buckets.push(UsageBucket { key, rx, tx });
    }

    Ok(UsageSeries {
        range: plan.range,
        buckets,
        rx: rx_total,
        tx: tx_total,
    })
}

#[tauri::command]
pub fn get_interface_totals(
    state: State<'_, Arc<AppState>>,
    days: u32,
) -> Res<Vec<InterfaceTotal>> {
    let since = local_midnight(days.max(1) as i64 - 1).timestamp();
    let conn = state.db.lock().unwrap();
    let rows = db::interface_totals(&conn, since)?;

    Ok(rows
        .into_iter()
        .map(|(name, rx, tx)| InterfaceTotal {
            is_wireless: net::is_wireless(&name),
            name,
            rx,
            tx,
        })
        .collect())
}

#[tauri::command]
pub fn get_quota_status(state: State<'_, Arc<AppState>>) -> Res<QuotaStatus> {
    let config = state.config.lock().unwrap().clone();
    let reset_day = config.reset_day.clamp(1, 28);

    if config.quota_gb <= 0.0 {
        return Ok(QuotaStatus {
            enabled: false,
            limit_bytes: 0,
            used_bytes: 0,
            projected_bytes: 0,
            period_start: 0,
            period_end: 0,
            days_elapsed: 0.0,
            days_total: 0.0,
            reset_day,
        });
    }

    let now = Local::now();
    let (start_year, start_month) = if now.day() >= reset_day {
        (now.year(), now.month())
    } else {
        offset_month(now.year(), now.month(), -1)
    };
    let (end_year, end_month) = offset_month(start_year, start_month, 1);

    let period_start = local_date_ts(start_year, start_month, reset_day);
    let period_end = local_date_ts(end_year, end_month, reset_day);

    let (rx, tx) = {
        let conn = state.db.lock().unwrap();
        db::usage_since(&conn, period_start)?
    };
    let used = rx + tx;

    let days_elapsed = ((now.timestamp() - period_start) as f64 / 86_400.0).max(1.0 / 24.0);
    let days_total = ((period_end - period_start) as f64 / 86_400.0).max(1.0);
    let projected = (used as f64 * days_total / days_elapsed) as u64;

    Ok(QuotaStatus {
        enabled: true,
        limit_bytes: (config.quota_gb * 1024.0 * 1024.0 * 1024.0) as u64,
        used_bytes: used,
        projected_bytes: projected,
        period_start,
        period_end,
        days_elapsed,
        days_total,
        reset_day,
    })
}

#[tauri::command]
pub fn get_wifi_info(state: State<'_, Arc<AppState>>) -> Res<Option<crate::models::WifiInfo>> {
    Ok(state.wifi.lock().unwrap().clone())
}

#[tauri::command]
pub fn get_app_meta(state: State<'_, Arc<AppState>>) -> Res<AppMeta> {
    Ok(AppMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        db_path: state.db_path.clone(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub fn clear_history(state: State<'_, Arc<AppState>>) -> Res<()> {
    {
        let conn = state.db.lock().unwrap();
        db::clear_all(&conn)?;
    }
    state.acc.lock().unwrap().clear();
    {
        let mut session = state.session.lock().unwrap();
        session.rx = 0;
        session.tx = 0;
    }
    Ok(())
}

struct SeriesPlan {
    range: String,
    format: &'static str,
    since: i64,
    keys: Vec<String>,
}

fn plan_series(range: &str) -> SeriesPlan {
    match range {
        "today" => {
            let start = local_midnight(0);
            let hours = Local::now().hour() as i64;
            let keys = (0..=hours)
                .map(|offset| {
                    (start + ChronoDuration::hours(offset))
                        .format("%Y-%m-%d %H")
                        .to_string()
                })
                .collect();
            SeriesPlan {
                range: range.to_string(),
                format: "%Y-%m-%d %H",
                since: start.timestamp(),
                keys,
            }
        }
        "30d" => daily_plan(range, 30),
        "12m" => monthly_plan(range, 12),
        _ => daily_plan("7d", 7),
    }
}

fn daily_plan(range: &str, days: i64) -> SeriesPlan {
    let start = local_midnight(days - 1);
    let keys = (0..days)
        .map(|offset| {
            (start + ChronoDuration::days(offset))
                .format("%Y-%m-%d")
                .to_string()
        })
        .collect();
    SeriesPlan {
        range: range.to_string(),
        format: "%Y-%m-%d",
        since: start.timestamp(),
        keys,
    }
}

fn monthly_plan(range: &str, months: i32) -> SeriesPlan {
    let now = Local::now();
    let mut keys = Vec::with_capacity(months as usize);
    let mut first_year = 0;
    let mut first_month = 0;

    for offset in (0..months).rev() {
        let (year, month) = offset_month(now.year(), now.month(), -offset);
        if offset == months - 1 {
            first_year = year;
            first_month = month;
        }
        keys.push(format!("{year:04}-{month:02}"));
    }

    SeriesPlan {
        range: range.to_string(),
        format: "%Y-%m",
        since: local_date_ts(first_year, first_month, 1),
        keys,
    }
}

fn tz_offset_secs() -> i32 {
    Local::now().offset().local_minus_utc()
}

fn local_midnight(days_back: i64) -> chrono::DateTime<Local> {
    let date = Local::now().date_naive() - ChronoDuration::days(days_back);
    date.and_hms_opt(0, 0, 0)
        .and_then(|naive| naive.and_local_timezone(Local).single())
        .unwrap_or_else(Local::now)
}

fn local_date_ts(year: i32, month: u32, day: u32) -> i64 {
    Local
        .with_ymd_and_hms(year, month, day, 0, 0, 0)
        .single()
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| Local::now().timestamp())
}

fn offset_month(year: i32, month: u32, delta: i32) -> (i32, u32) {
    let index = year * 12 + (month as i32 - 1) + delta;
    (
        index.div_euclid(12),
        (index.rem_euclid(12) + 1) as u32,
    )
}
