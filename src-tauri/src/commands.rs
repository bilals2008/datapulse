use chrono::{Datelike, Duration as ChronoDuration, Local, TimeZone};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

use crate::analytics;
use crate::error::AppError;
use crate::lan::LanServer;
use crate::models::{
    Anomaly, AnomalyMark, AppMeta, BusiestDay, DailyTotal, FreeWindow, HourBytes, ImportResult,
    InterfaceTotal, LanInfo, QuotaStatus, Recap, SpeedHour, SpeedReport, SpeedSample, TickPayload,
    Timeline, TimelineBucket, UsageBucket, UsageSeries, Wrapped,
};
use crate::state::{AppState, Config};
use crate::{collector, db, net, speed};

type Res<T> = Result<T, AppError>;

const DAY_SECS: i64 = 86_400;
const HOUR_SECS: i64 = 3_600;
const MINUTE_SECS: i64 = 60;
/// Days of history the quiet-window average is drawn from.
const QUIET_LOOKBACK_DAYS: i64 = 14;
/// Longest time-machine span before dropping from per-minute to hourly buckets.
const MINUTE_RESOLUTION_LIMIT: i64 = 36 * HOUR_SECS;
/// Longest span kept at hourly resolution before falling back to daily buckets.
const HOURLY_RESOLUTION_LIMIT: i64 = 60 * DAY_SECS;

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
    if !next.rate_per_gb.is_finite() || next.rate_per_gb < 0.0 {
        next.rate_per_gb = 0.0;
    }
    next.currency = next.currency.trim().chars().take(6).collect();
    next.retention_days = next.retention_days.min(3650);

    let previous = state.config.lock().unwrap().clone();
    if next.lan_enabled && next.lan_token.is_empty() {
        next.lan_token = generate_token();
    }

    {
        let conn = state.db.lock().unwrap();
        db::save_config(&conn, &next)?;
    }

    *state.config.lock().unwrap() = next.clone();

    if previous.retention_days != next.retention_days {
        collector::compact(state.inner());
    }

    if previous.lan_enabled != next.lan_enabled || previous.lan_token != next.lan_token {
        apply_lan(state.inner(), &next);
    }

    Ok(next)
}

/// (Re)starts the LAN dashboard to match `config`. Dropping the old server stops
/// its accept loop.
pub(crate) fn apply_lan(state: &Arc<AppState>, config: &Config) {
    let mut slot = state.lan.lock().unwrap();
    *slot = None;
    if config.lan_enabled {
        *slot = LanServer::start(Arc::clone(state), config.lan_token.clone());
    }
}

/// Shared secret in the dashboard URL. Seeded from the OS RNG via `RandomState`.
fn generate_token() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    (0..2)
        .map(|_| {
            let mut hasher = RandomState::new().build_hasher();
            hasher.write_u64(std::process::id() as u64);
            format!("{:016x}", hasher.finish())
        })
        .collect()
}

#[tauri::command]
pub fn get_usage_series(state: State<'_, Arc<AppState>>, range: String) -> Res<UsageSeries> {
    usage_series(state.inner(), &range)
}

/// Shared with the LAN dashboard, which serves today's buckets to the page.
pub fn usage_series(state: &Arc<AppState>, range: &str) -> Res<UsageSeries> {
    let plan = plan_series(range);
    let conn = state.db.lock().unwrap();
    let map = db::series(&conn, plan.format, plan.since, analytics::local_offset_secs())?;

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
    quota_status(state.inner())
}

/// Current cap status. Shared with the tray/taskbar HUD and the LAN dashboard.
pub fn quota_status(state: &Arc<AppState>) -> Res<QuotaStatus> {
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
            avg_daily: 0,
            daily_budget: 0,
            forecast_bytes: 0,
            days_to_limit: analytics::FAR_FUTURE_DAYS,
            over_budget: false,
            burn: Vec::new(),
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
    let today = local_midnight(0).timestamp();
    let limit = (config.quota_gb * 1024.0 * 1024.0 * 1024.0) as u64;
    let tz = analytics::local_offset_secs();

    let (used, daily) = {
        let conn = state.db.lock().unwrap();
        let (rx, tx) = db::usage_since(&conn, period_start)?;
        let daily = db::daily_by_day(&conn, today - analytics::history_lookback_secs(), tz)?;
        (rx + tx, daily)
    };

    let projection = analytics::forecast(
        &daily, period_start, period_end, today, used, limit, tz,
    );

    let days_elapsed = ((now.timestamp() - period_start) as f64 / DAY_SECS as f64).max(1.0 / 24.0);
    let days_total = ((period_end - period_start) as f64 / DAY_SECS as f64).max(1.0);

    Ok(QuotaStatus {
        enabled: true,
        limit_bytes: limit,
        used_bytes: used,
        projected_bytes: projection.projected,
        period_start,
        period_end,
        days_elapsed,
        days_total,
        reset_day,
        avg_daily: projection.avg_daily,
        daily_budget: projection.daily_budget,
        forecast_bytes: projection.projected,
        days_to_limit: projection.days_to_limit,
        over_budget: projection.over_budget,
        burn: projection.burn,
    })
}

#[tauri::command]
pub fn get_anomalies(state: State<'_, Arc<AppState>>, limit: u32) -> Res<Vec<Anomaly>> {
    let conn = state.db.lock().unwrap();
    db::list_anomalies(&conn, limit)
}

#[tauri::command]
pub fn get_anomaly_marks(
    state: State<'_, Arc<AppState>>,
    range: String,
) -> Res<Vec<AnomalyMark>> {
    let since = plan_series(&range).since;
    let conn = state.db.lock().unwrap();
    Ok(db::anomaly_marks(&conn, since)?
        .into_iter()
        .map(|(ts, kind)| AnomalyMark { ts, kind })
        .collect())
}

#[tauri::command]
pub fn dismiss_anomaly(state: State<'_, Arc<AppState>>, id: i64) -> Res<()> {
    let conn = state.db.lock().unwrap();
    db::dismiss_anomaly(&conn, id)
}

#[tauri::command]
pub fn dismiss_all_anomalies(state: State<'_, Arc<AppState>>) -> Res<()> {
    let conn = state.db.lock().unwrap();
    db::dismiss_all_anomalies(&conn)
}

#[tauri::command]
pub fn get_timeline(state: State<'_, Arc<AppState>>, start: i64, end: i64) -> Res<Timeline> {
    let tz = analytics::local_offset_secs();
    let now = Local::now().timestamp();

    let end = end.min(now + MINUTE_SECS).max(MINUTE_SECS);
    let start = start.min(end - MINUTE_SECS).max(0);
    let step = resolve_resolution(end - start);
    let aligned_start = floor_to(start, step, tz);

    let conn = state.db.lock().unwrap();
    let rows = db::buckets(&conn, aligned_start, end + step, step, tz)?;
    let interfaces = db::interface_totals_between(&conn, aligned_start, end)?;

    let mut map: HashMap<i64, (u64, u64)> = rows
        .into_iter()
        .map(|(ts, rx, tx)| (ts, (rx, tx)))
        .collect();

    let mut buckets = Vec::new();
    let mut rx_total = 0_u64;
    let mut tx_total = 0_u64;
    let mut cursor = aligned_start;

    while cursor <= end {
        let (rx, tx) = map.remove(&cursor).unwrap_or((0, 0));
        rx_total += rx;
        tx_total += tx;
        buckets.push(TimelineBucket { ts: cursor, rx, tx });
        cursor += step;
    }

    Ok(Timeline {
        start: aligned_start,
        end,
        resolution: step,
        rx: rx_total,
        tx: tx_total,
        buckets,
        interfaces: interfaces
            .into_iter()
            .map(|(name, rx, tx)| InterfaceTotal {
                is_wireless: net::is_wireless(&name),
                name,
                rx,
                tx,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn get_daily_activity(state: State<'_, Arc<AppState>>, days: u32) -> Res<Vec<DailyTotal>> {
    let days = days.clamp(7, 366) as i64;
    let start = local_midnight(days - 1);
    let tz = analytics::local_offset_secs();

    let rows = {
        let conn = state.db.lock().unwrap();
        db::daily_totals(&conn, start.timestamp(), tz)?
    };

    let mut map: HashMap<i64, (u64, u64)> = rows
        .into_iter()
        .map(|(ts, rx, tx)| (ts, (rx, tx)))
        .collect();

    let mut out = Vec::with_capacity(days as usize);
    for offset in 0..days {
        let day = start + ChronoDuration::days(offset);
        let (rx, tx) = map.remove(&day.timestamp()).unwrap_or((0, 0));
        out.push(DailyTotal {
            day: day.format("%Y-%m-%d").to_string(),
            rx,
            tx,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn get_recap(state: State<'_, Arc<AppState>>) -> Res<Recap> {
    let tz = analytics::local_offset_secs();
    let week_start = local_midnight(6).timestamp();
    let prev_start = local_midnight(13).timestamp();

    let (this_week, last_week, busiest_day, busiest_hour, top_interface) = {
        let conn = state.db.lock().unwrap();

        let daily = db::daily_totals(&conn, prev_start, tz)?;
        let mut this_week = 0_u64;
        let mut last_week = 0_u64;
        let mut busiest_day: Option<BusiestDay> = None;

        for (ts, rx, tx) in daily {
            let total = rx + tx;
            if ts >= week_start {
                this_week += total;
                if busiest_day.as_ref().map_or(true, |day| total > day.bytes) {
                    busiest_day = Some(BusiestDay {
                        day: format_local_day(ts),
                        bytes: total,
                    });
                }
            } else if ts >= prev_start {
                last_week += total;
            }
        }

        let busiest_hour = db::hourly_totals(&conn, week_start, tz)
            .unwrap_or_default()
            .into_iter()
            .filter(|(_, bytes)| *bytes > 0)
            .max_by_key(|(_, bytes)| *bytes)
            .map(|(hour, _)| hour);

        let top_interface = db::interface_totals(&conn, week_start)?
            .into_iter()
            .next()
            .map(|(name, rx, tx)| InterfaceTotal {
                is_wireless: net::is_wireless(&name),
                name,
                rx,
                tx,
            });

        (this_week, last_week, busiest_day, busiest_hour, top_interface)
    };

    let delta_percent = if last_week > 0 {
        (this_week as f64 - last_week as f64) / last_week as f64 * 100.0
    } else {
        0.0
    };

    Ok(Recap {
        this_week,
        last_week,
        delta_percent,
        avg_daily: this_week / 7,
        busiest_day,
        busiest_hour,
        top_interface,
    })
}

/// Local [start, end) window and its names for one recap period, `offset`
/// periods back from now.
fn wrapped_window(period: &str, offset: i32) -> (i64, i64, String, String) {
    let now = Local::now();
    let offset = offset.clamp(0, 400) as i64;

    match period {
        "day" => {
            let start = local_midnight(offset).timestamp();
            let day = Local.timestamp_opt(start, 0).single().unwrap_or(now);
            let short = day.format("%-d %b").to_string();
            (start, start + DAY_SECS, short.clone(), format!("On {short}"))
        }
        "week" => {
            let start =
                local_midnight(now.weekday().num_days_from_monday() as i64 + offset * 7).timestamp();
            let day = Local.timestamp_opt(start, 0).single().unwrap_or(now);
            let short = day.format("%-d %b").to_string();
            (
                start,
                start + 7 * DAY_SECS,
                short.clone(),
                format!("In the week of {short}"),
            )
        }
        "month" => {
            let (year, month) = offset_month(now.year(), now.month(), -(offset as i32));
            let (next_year, next_month) = offset_month(year, month, 1);
            let first = Local
                .with_ymd_and_hms(year, month, 1, 0, 0, 0)
                .single()
                .unwrap_or(now);
            (
                local_date_ts(year, month, 1),
                local_date_ts(next_year, next_month, 1),
                first.format("%b %Y").to_string(),
                format!("In {}", first.format("%B %Y")),
            )
        }
        _ => {
            let year = (now.year() - offset as i32).clamp(2000, 2100);
            (
                local_date_ts(year, 1, 1),
                local_date_ts(year + 1, 1, 1),
                year.to_string(),
                format!("In {}", year),
            )
        }
    }
}

#[tauri::command]
pub fn get_wrapped(
    state: State<'_, Arc<AppState>>,
    period: String,
    offset: i32,
) -> Res<Wrapped> {
    let (start, end, label, headline) = wrapped_window(&period, offset);
    let year = Local
        .timestamp_opt(start, 0)
        .single()
        .map(|dt| dt.year())
        .unwrap_or_else(|| Local::now().year());
    let tz = analytics::local_offset_secs();

    let (days, hours, top_interface) = {
        let conn = state.db.lock().unwrap();
        let top = db::interface_totals_between(&conn, start, end)?
            .into_iter()
            .next()
            .map(|(name, rx, tx)| InterfaceTotal {
                is_wireless: net::is_wireless(&name),
                name,
                rx,
                tx,
            });
        (
            db::buckets(&conn, start, end, DAY_SECS, tz)?,
            db::buckets(&conn, start, end, HOUR_SECS, tz)?,
            top,
        )
    };

    let mut rx_total = 0_u64;
    let mut tx_total = 0_u64;
    let mut active_days = 0_u32;
    let mut busiest_day: Option<BusiestDay> = None;

    for (ts, rx, tx) in days {
        let bytes = rx + tx;
        rx_total += rx;
        tx_total += tx;
        if bytes > 0 {
            active_days += 1;
        }
        if busiest_day.as_ref().map_or(bytes > 0, |day| bytes > day.bytes) {
            busiest_day = Some(BusiestDay {
                day: format_local_day(ts),
                bytes,
            });
        }
    }

    let mut by_hour = [0_u64; 24];
    for (ts, rx, tx) in hours {
        let hour = ((ts + tz as i64).rem_euclid(DAY_SECS) / HOUR_SECS) as usize;
        by_hour[hour] += rx + tx;
    }

    let total = rx_total + tx_total;
    Ok(Wrapped {
        year,
        label,
        headline,
        total,
        rx: rx_total,
        tx: tx_total,
        busiest_day,
        busiest_hour: by_hour
            .iter()
            .enumerate()
            .max_by_key(|(_, bytes)| **bytes)
            .filter(|(_, bytes)| **bytes > 0)
            .map(|(hour, _)| hour as u32),
        top_interface,
        active_days,
        avg_daily: total.checked_div(active_days as u64).unwrap_or(0),
    })
}

/// Writes a rendered recap card into the user's Downloads folder, where a
/// browser download would land. The webview cannot save files on its own.
#[tauri::command]
pub fn save_wrapped_png(app: AppHandle, slug: String, data: Vec<u8>) -> Res<String> {
    const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    const MAX_BYTES: usize = 16 * 1024 * 1024;

    if data.len() < PNG_MAGIC.len() || data[..PNG_MAGIC.len()] != PNG_MAGIC {
        return Err(AppError::Io(std::io::Error::other("not a PNG image")));
    }
    if data.len() > MAX_BYTES {
        return Err(AppError::Io(std::io::Error::other("image too large")));
    }

    let dir = app
        .path()
        .download_dir()
        .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
    std::fs::create_dir_all(&dir)?;

    let slug: String = slug
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-');
    let path = dir.join(format!("datapulse-wrapped-{}.png", non_empty(slug, "card")));
    std::fs::write(&path, &data)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_free_window(state: State<'_, Arc<AppState>>) -> Res<FreeWindow> {
    let tz = analytics::local_offset_secs();
    let since = local_midnight(QUIET_LOOKBACK_DAYS - 1).timestamp();

    let rows = {
        let conn = state.db.lock().unwrap();
        db::average_hourly(&conn, since, tz)?
    };

    let day = analytics::hourly_average(&rows);
    let (start_hour, window_bytes) = analytics::quietest_window(&day);
    let day_bytes = day.iter().sum::<u64>() / 24;
    let busiest_hour = day
        .iter()
        .enumerate()
        .max_by_key(|(_, bytes)| *bytes)
        .filter(|(_, bytes)| **bytes > 0)
        .map(|(hour, _)| hour as u32);

    let quota = quota_status(&state).ok().filter(|quota| quota.enabled);
    let advice = match quota {
        Some(quota) => {
            let remaining = quota.limit_bytes.saturating_sub(quota.used_bytes);
            format!(
                "{} left this period. This window has averaged {} per hour, so a four-hour run \
                 moves about {}.",
                analytics::human_bytes(remaining),
                analytics::human_bytes(window_bytes),
                analytics::human_bytes(window_bytes.saturating_mul(4)),
            )
        }
        None => "Set a data cap to see how much remaining allowance this window can carry."
            .to_string(),
    };

    Ok(FreeWindow {
        start_hour,
        end_hour: (start_hour + analytics::WINDOW_HOURS) % 24,
        window_bytes,
        day_bytes,
        busiest_hour,
        advice,
        hours: day
            .iter()
            .enumerate()
            .map(|(hour, bytes)| HourBytes {
                hour: hour as u32,
                bytes: *bytes,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn get_speed_report(state: State<'_, Arc<AppState>>) -> Res<SpeedReport> {
    let enabled = state.config.lock().unwrap().speedtest_enabled;
    let tz = analytics::local_offset_secs();

    let (latest, samples) = {
        let conn = state.db.lock().unwrap();
        let latest = db::latest_speed_sample(&conn)?;
        let since = Local::now().timestamp() - 90 * DAY_SECS;
        (latest, db::speed_samples_since(&conn, since)?)
    };

    let mut totals = [0.0_f64; 24];
    let mut counts = [0_u32; 24];
    for sample in &samples {
        if !sample.ok || sample.down_bps <= 0.0 {
            continue;
        }
        let hour = ((sample.ts + tz as i64).rem_euclid(DAY_SECS) / HOUR_SECS) as usize;
        totals[hour] += sample.down_bps;
        counts[hour] += 1;
    }

    let by_hour: Vec<SpeedHour> = (0..24)
        .filter(|hour| counts[*hour] > 0)
        .map(|hour| SpeedHour {
            hour: hour as u32,
            mbps: totals[hour] / counts[hour] as f64 * 8.0 / 1_000_000.0,
            samples: counts[hour],
        })
        .collect();

    Ok(SpeedReport {
        enabled,
        latest,
        best: by_hour
            .iter()
            .max_by(|a, b| a.mbps.total_cmp(&b.mbps))
            .cloned(),
        worst: by_hour
            .iter()
            .min_by(|a, b| a.mbps.total_cmp(&b.mbps))
            .cloned(),
        by_hour,
    })
}

#[tauri::command]
pub async fn run_speedtest(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Res<SpeedSample> {
    let sample = tauri::async_runtime::spawn_blocking(speed::run_test)
        .await
        .map_err(|error| AppError::Io(std::io::Error::other(error)))?;

    speed::record(&app, state.inner(), &sample);
    Ok(sample)
}

#[tauri::command]
pub fn get_lan_info(state: State<'_, Arc<AppState>>) -> Res<LanInfo> {
    let enabled = state.config.lock().unwrap().lan_enabled;
    let lan = state.lan.lock().unwrap();

    Ok(LanInfo {
        enabled,
        running: lan.is_some(),
        url: lan.as_ref().map(|server| server.url().to_string()).unwrap_or_default(),
    })
}

fn non_empty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() {
        fallback
    } else {
        value
    }
}

fn format_local_day(ts: i64) -> String {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

fn resolve_resolution(span: i64) -> i64 {
    if span <= MINUTE_RESOLUTION_LIMIT {
        MINUTE_SECS
    } else if span <= HOURLY_RESOLUTION_LIMIT {
        HOUR_SECS
    } else {
        DAY_SECS
    }
}

fn floor_to(ts: i64, step: i64, tz_offset: i32) -> i64 {
    let shifted = ts + tz_offset as i64;
    shifted - shifted.rem_euclid(step) - tz_offset as i64
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
pub fn export_usage(state: State<'_, Arc<AppState>>, path: String) -> Res<u64> {
    let conn = state.db.lock().unwrap();
    let file = std::io::BufWriter::new(std::fs::File::create(&path)?);
    db::export_rows(&conn, file)
}

#[tauri::command]
pub fn import_usage(state: State<'_, Arc<AppState>>, path: String) -> Res<ImportResult> {
    let mut conn = state.db.lock().unwrap();
    let (imported, skipped) = db::import_file(&mut conn, &path)?;
    Ok(ImportResult { imported, skipped })
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
            // All 24 hours, zero-filled: a single bucket just after midnight
            // collapses the chart into a dot.
            let keys = (0_i64..24)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_series_covers_all_24_hours() {
        let plan = plan_series("today");
        let midnight = local_midnight(0);
        assert_eq!(plan.keys.len(), 24);
        assert_eq!(plan.keys[0], midnight.format("%Y-%m-%d %H").to_string());
        assert_eq!(
            plan.keys[23],
            (midnight + ChronoDuration::hours(23))
                .format("%Y-%m-%d %H")
                .to_string()
        );
    }

    #[test]
    fn wrapped_windows_are_ordered_and_move_back_one_period() {
        for period in ["day", "week", "month", "year"] {
            let (start, end, label, headline) = wrapped_window(period, 0);
            let (prev_start, prev_end, prev_label, prev_headline) = wrapped_window(period, 1);
            assert!(start < end, "{period} window is not a range");
            assert!(prev_end <= start, "{period} offset 1 overlaps offset 0");
            assert_ne!(label, prev_label, "{period} label does not change");
            assert_ne!(headline, prev_headline, "{period} headline is static");
            assert_eq!(wrapped_window(period, -5), wrapped_window(period, 0));
        }
    }
}
