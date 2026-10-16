use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::models::SpeedSample;
use crate::state::AppState;
use crate::db;

/// Fixed payload from Cloudflare's speed endpoint. Two megabytes keeps a full
/// day of hourly runs around 48 MB while still averaging over a slow link.
const TEST_URL: &str = "https://speed.cloudflare.com/__down?bytes=2000000";
const RUN_INTERVAL: Duration = Duration::from_secs(3600);
const CHECK_INTERVAL: Duration = Duration::from_secs(30);
const TIMEOUT: Duration = Duration::from_secs(25);

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Pulls the test payload and measures effective throughput. Blocking; call it
/// from a worker thread.
pub fn run_test() -> SpeedSample {
    let ts = now_secs();

    let client = match reqwest::blocking::Client::builder().timeout(TIMEOUT).build() {
        Ok(client) => client,
        Err(error) => return failure(ts, &error.to_string()),
    };

    let started = Instant::now();
    let mut response = match client.get(TEST_URL).send() {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => return failure(ts, &format!("HTTP {}", response.status())),
        Err(error) => return failure(ts, &error.to_string()),
    };
    let latency_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mut body = Vec::new();
    if let Err(error) = std::io::Read::read_to_end(&mut response, &mut body) {
        return failure(ts, &error.to_string());
    }

    let seconds = started.elapsed().as_secs_f64().max(0.001);
    SpeedSample {
        ts,
        down_bps: body.len() as f64 / seconds,
        latency_ms,
        bytes: body.len() as u64,
        ok: true,
        error: String::new(),
    }
}

fn failure(ts: i64, error: &str) -> SpeedSample {
    SpeedSample {
        ts,
        down_bps: 0.0,
        latency_ms: 0.0,
        bytes: 0,
        ok: false,
        error: error.to_string(),
    }
}

/// Runs the test on a schedule while the feature is switched on. The first run
/// after launch or after switching it on happens within one check interval.
pub fn spawn(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || {
        let mut last_run = due();

        loop {
            thread::sleep(CHECK_INTERVAL);

            if !state.config.lock().unwrap().speedtest_enabled {
                last_run = due();
                continue;
            }
            if last_run.elapsed() < RUN_INTERVAL {
                continue;
            }
            last_run = Instant::now();

            let sample = run_test();
            record(&app, &state, &sample);
        }
    });
}

fn due() -> Instant {
    Instant::now()
        .checked_sub(RUN_INTERVAL)
        .unwrap_or_else(Instant::now)
}

pub fn record(app: &AppHandle, state: &Arc<AppState>, sample: &SpeedSample) {
    {
        let conn = state.db.lock().unwrap();
        let _ = db::insert_speed_sample(&conn, sample);
    }
    let _ = app.emit("pulse-speed", sample);
}
