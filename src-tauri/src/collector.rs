use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::Networks;
use tauri::{AppHandle, Emitter};

use crate::analytics::{self, HourRow};
use crate::models::{InterfaceSnapshot, TickPayload};
use crate::state::AppState;
use crate::{db, hud, net, procs, wifi};

const FLUSH_INTERVAL: Duration = Duration::from_secs(5);
const WIFI_INTERVAL: Duration = Duration::from_secs(15);
const HUD_INTERVAL: Duration = Duration::from_secs(15);
const ANOMALY_INTERVAL: Duration = Duration::from_secs(300);
const ANOMALY_LOOKBACK: i64 = 30 * 86_400;
const COMPACT_INTERVAL: Duration = Duration::from_secs(6 * 3600);
const MAX_DELTA_RATE: f64 = 1_000_000_000.0;

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn spawn(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || run_loop(app, state));
}

fn run_loop(app: AppHandle, state: Arc<AppState>) {
    let mut networks = Networks::new_with_refreshed_list();
    carry_forward(&state, &networks);

    let mut prev_tick = Instant::now();
    let mut last_flush = Instant::now();
    let mut last_wifi = Instant::now()
        .checked_sub(WIFI_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut last_hud = Instant::now();
    let mut last_anomaly = Instant::now()
        .checked_sub(ANOMALY_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut last_compact = Instant::now()
        .checked_sub(COMPACT_INTERVAL)
        .unwrap_or_else(Instant::now);

    loop {
        let config = state.config.lock().unwrap().clone();
        let tick = Duration::from_millis(config.refresh_ms.clamp(250, 10_000));

        let elapsed = prev_tick.elapsed().as_secs_f64().max(0.05);
        prev_tick = Instant::now();

        networks.refresh(true);

        let mut interfaces = Vec::with_capacity(networks.len());
        let mut totals: HashMap<String, (u64, u64)> = HashMap::with_capacity(networks.len());
        let mut rx_rate = 0.0_f64;
        let mut tx_rate = 0.0_f64;

        for (name, data) in &networks {
            let rx = data.received();
            let tx = data.transmitted();
            let rx_total = data.total_received();
            let tx_total = data.total_transmitted();

            interfaces.push(InterfaceSnapshot {
                name: name.clone(),
                is_wireless: net::is_wireless(name),
                rx_rate: rx as f64 / elapsed,
                tx_rate: tx as f64 / elapsed,
                rx_total,
                tx_total,
            });

            if !net::is_loopback(name) {
                rx_rate += rx as f64 / elapsed;
                tx_rate += tx as f64 / elapsed;
            }

            if rx > 0 || tx > 0 {
                let mut acc = state.acc.lock().unwrap();
                let entry = acc.entry(name.clone()).or_insert((0, 0));
                entry.0 += rx;
                entry.1 += tx;
                drop(acc);

                let mut session = state.session.lock().unwrap();
                session.rx += rx;
                session.tx += tx;
            }

            totals.insert(name.clone(), (rx_total, tx_total));
        }

        *state.totals.lock().unwrap() = totals;

        interfaces.sort_by(|a, b| {
            let left = b.rx_rate + b.tx_rate;
            let right = a.rx_rate + a.tx_rate;
            left.partial_cmp(&right).unwrap_or(std::cmp::Ordering::Equal)
        });

        let (session_rx, session_tx) = {
            let session = state.session.lock().unwrap();
            (session.rx, session.tx)
        };

        let payload = TickPayload {
            ts: now_secs(),
            interfaces,
            rx_rate,
            tx_rate,
            session_rx,
            session_tx,
        };

        *state.latest.lock().unwrap() = payload.clone();
        let _ = app.emit("pulse-tick", &payload);

        if last_wifi.elapsed() >= WIFI_INTERVAL {
            *state.wifi.lock().unwrap() = wifi::read_wifi();
            last_wifi = Instant::now();
        }

        if last_hud.elapsed() >= HUD_INTERVAL {
            hud::refresh(&app, &state);
            last_hud = Instant::now();
        }

        if last_flush.elapsed() >= FLUSH_INTERVAL {
            flush(&state);
            last_flush = Instant::now();
        }

        if last_anomaly.elapsed() >= ANOMALY_INTERVAL {
            scan_anomalies(&app, &state);
            last_anomaly = Instant::now();
        }

        if last_compact.elapsed() >= COMPACT_INTERVAL {
            compact(&state);
            last_compact = Instant::now();
        }

        thread::sleep(tick);
    }
}

pub fn flush(state: &Arc<AppState>) {
    let drained: Vec<(String, (u64, u64))> = {
        let mut acc = state.acc.lock().unwrap();
        acc.drain().collect()
    };

    let ts = now_secs();
    let ts_min = ts - ts.rem_euclid(60);
    let totals = state.totals.lock().unwrap().clone();

    let conn = state.db.lock().unwrap();

    for (iface, (rx, tx)) in drained {
        let _ = db::insert_usage(&conn, ts_min, &iface, rx, tx);
    }

    for (iface, (rx, tx)) in totals {
        let _ = db::upsert_cumulative(&conn, &iface, rx, tx, ts);
    }
}

/// Rolls minute rows older than the retention window up to hourly rows. Sums
/// are unchanged, so daily, monthly and hour-of-day views keep their numbers.
pub(crate) fn compact(state: &Arc<AppState>) {
    let days = state.config.lock().unwrap().retention_days;
    if days == 0 {
        return;
    }

    let tz = analytics::local_offset_secs();
    let cutoff = now_secs() - days as i64 * 86_400;
    let cutoff = cutoff - (cutoff + tz as i64).rem_euclid(3600);

    let conn = state.db.lock().unwrap();
    let _ = db::compact_history(&conn, cutoff, tz);
}

fn scan_anomalies(app: &AppHandle, state: &Arc<AppState>) {
    let now = now_secs();
    let since = now - ANOMALY_LOOKBACK;
    let tz = analytics::local_offset_secs();

    let rows = {
        let conn = state.db.lock().unwrap();
        let _ = db::prune_anomalies(&conn, since);
        db::hourly_by_iface(&conn, since, tz).unwrap_or_default()
    };

    let hours: Vec<HourRow> = rows
        .into_iter()
        .map(|(ts, iface, bytes)| HourRow { ts, iface, bytes })
        .collect();

    let detected = analytics::detect_anomalies(&hours, tz, now);
    if detected.is_empty() {
        return;
    }

    // Sampling processes sleeps for one CPU interval; doing it here keeps the
    // cost off the tick loop and only pays it on the scans that found something.
    let procs = procs::top_processes();

    let conn = state.db.lock().unwrap();
    for mut anomaly in detected {
        anomaly.procs = procs.clone();
        if let Ok(true) = db::insert_anomaly(&conn, &anomaly, now) {
            let _ = app.emit("pulse-anomaly", &anomaly);
        }
    }
}

fn carry_forward(state: &Arc<AppState>, networks: &Networks) {
    let stored = {
        let conn = state.db.lock().unwrap();
        db::cumulative(&conn).unwrap_or_default()
    };

    let now = now_secs();
    let conn = state.db.lock().unwrap();

    for (name, data) in networks {
        let rx = data.total_received();
        let tx = data.total_transmitted();

        if let Some((stored_rx, stored_tx, stored_ts)) = stored.get(name).copied() {
            if rx >= stored_rx && tx >= stored_tx {
                let drx = rx - stored_rx;
                let dtx = tx - stored_tx;
                if drx > 0 || dtx > 0 {
                    let gap = (now - stored_ts).max(1) as f64;
                    if (drx + dtx) as f64 / gap <= MAX_DELTA_RATE {
                        let bucket = stored_ts - stored_ts.rem_euclid(60);
                        let _ = db::insert_usage(&conn, bucket, name, drx, dtx);
                    }
                }
            }
        }

        let _ = db::upsert_cumulative(&conn, name, rx, tx, now);
    }
}
