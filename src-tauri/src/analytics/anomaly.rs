use std::collections::HashMap;

use super::{human_bytes, median};
use crate::models::Anomaly;

const HOUR: i64 = 3600;
const DAY: i64 = 86_400;
const GIB: u64 = 1024 * 1024 * 1024;

/// Hours considered "overnight" when the device is usually idle.
const NIGHT_START_HOUR: i64 = 0;
const NIGHT_END_HOUR: i64 = 6;

/// Absolute floors so a nearly-idle baseline does not flag trivial traffic.
const MIN_SPIKE_BYTES: u64 = 50 * 1024 * 1024;
const MIN_NIGHT_BYTES: u64 = 100 * 1024 * 1024;

/// Robust thresholds: median + k·MAD (scaled to a normal-equivalent sigma).
const SPIKE_SIGMA: f64 = 3.5;
const NIGHT_SIGMA: f64 = 1.5;

/// A single hour of transfer for one interface.
#[derive(Debug, Clone)]
pub struct HourRow {
    pub ts: i64,
    pub iface: String,
    pub bytes: u64,
}

struct HourAgg {
    total: u64,
    top_iface: String,
    top_bytes: u64,
}

/// Detect statistically unusual hours of activity.
///
/// `rows` must be aligned to the local hour. The current, still-running hour is
/// excluded so partially collected data never looks like a spike.
pub fn detect_anomalies(rows: &[HourRow], tz_offset: i32, now: i64) -> Vec<Anomaly> {
    if rows.is_empty() {
        return Vec::new();
    }

    let current_hour = align_floor(now, HOUR, tz_offset);
    let mut hours: HashMap<i64, HourAgg> = HashMap::new();
    for row in rows {
        let entry = hours.entry(row.ts).or_insert_with(|| HourAgg {
            total: 0,
            top_iface: String::new(),
            top_bytes: 0,
        });
        entry.total += row.bytes;
        if row.bytes > entry.top_bytes {
            entry.top_bytes = row.bytes;
            entry.top_iface = row.iface.clone();
        }
    }

    let mut complete: Vec<(i64, u64, String)> = hours
        .into_iter()
        .filter(|(ts, _)| *ts < current_hour)
        .map(|(ts, agg)| (ts, agg.total, agg.top_iface))
        .collect();
    complete.sort_by_key(|(ts, _, _)| *ts);
    if complete.is_empty() {
        return Vec::new();
    }

    let series = zero_filled_series(&complete);
    let baseline = median(&series);
    let mad = median(&series.iter().map(|v| v.abs_diff(baseline)).collect::<Vec<_>>());
    let sigma = 1.4826 * mad as f64;

    let spike_threshold =
        ((baseline as f64 + SPIKE_SIGMA * sigma).max(baseline as f64 * 3.0) as u64)
            .max(MIN_SPIKE_BYTES);
    let night_threshold =
        ((baseline as f64 + NIGHT_SIGMA * sigma) as u64).max(MIN_NIGHT_BYTES);

    let mut out = Vec::new();
    for (ts, total, iface) in complete {
        if total == 0 {
            continue;
        }

        let hour = local_hour(ts, tz_offset);
        let is_night = (NIGHT_START_HOUR..NIGHT_END_HOUR).contains(&hour);
        let ratio = if baseline > 0 {
            total as f64 / baseline as f64
        } else {
            0.0
        };

        let night_hit = is_night && total >= night_threshold && total > baseline;
        if total < spike_threshold && !night_hit {
            continue;
        }

        let kind = if is_night { "night" } else { "spike" };
        out.push(Anomaly {
            id: 0,
            kind: kind.to_string(),
            ts,
            iface,
            bytes: total,
            baseline,
            ratio,
            severity: severity_of(total, ratio).to_string(),
            message: describe(kind, total, ratio, hour),
            procs: Vec::new(),
        });
    }

    out
}

fn zero_filled_series(complete: &[(i64, u64, String)]) -> Vec<u64> {
    let first = complete[0].0;
    let last = complete[complete.len() - 1].0;
    let mut series = Vec::new();
    let mut cursor = first;
    let mut index = 0;

    while cursor <= last {
        if index < complete.len() && complete[index].0 == cursor {
            series.push(complete[index].1);
            index += 1;
        } else {
            series.push(0);
        }
        cursor += HOUR;
    }
    series
}

fn severity_of(bytes: u64, ratio: f64) -> &'static str {
    if bytes >= 4 * GIB || ratio >= 10.0 {
        "high"
    } else if bytes >= GIB || ratio >= 5.0 {
        "medium"
    } else {
        "low"
    }
}

fn describe(kind: &str, bytes: u64, ratio: f64, hour: i64) -> String {
    let amount = human_bytes(bytes);
    if kind == "night" {
        return format!(
            "{amount} transferred between {hour:02}:00 and {next:02}:00 while the device was likely idle",
            next = hour + 1,
        );
    }

    if ratio >= 2.0 {
        format!("{amount} in a single hour — {ratio:.1}× your typical pace")
    } else {
        format!("{amount} of traffic concentrated in a single hour")
    }
}

fn align_floor(ts: i64, step: i64, tz_offset: i32) -> i64 {
    let shifted = ts + tz_offset as i64;
    shifted - shifted.rem_euclid(step) - tz_offset as i64
}

fn local_hour(ts: i64, tz_offset: i32) -> i64 {
    (ts + tz_offset as i64).rem_euclid(DAY) / HOUR
}

#[cfg(test)]
mod tests {
    use super::*;

    const MB: u64 = 1024 * 1024;

    fn row(ts: i64, iface: &str, bytes: u64) -> HourRow {
        HourRow {
            ts,
            iface: iface.to_string(),
            bytes,
        }
    }

    #[test]
    fn flags_a_clear_daytime_spike() {
        let day = 1_700_000_000 - (1_700_000_000 % DAY);
        let mut rows: Vec<HourRow> = (0..24)
            .map(|i| row(day + i * HOUR, "Wi-Fi", MB))
            .collect();
        let spike_ts = day + 14 * HOUR;
        rows.push(row(spike_ts, "Ethernet", 500 * MB));

        let found = detect_anomalies(&rows, 0, day + 20 * HOUR);

        let spike = found.iter().find(|a| a.ts == spike_ts).expect("spike");
        assert_eq!(spike.kind, "spike");
        assert_eq!(spike.iface, "Ethernet");
        assert_eq!(spike.bytes, 501 * MB);
    }

    #[test]
    fn ignores_constant_usage() {
        let start = 1_700_000_000 - (1_700_000_000 % HOUR);
        let rows: Vec<HourRow> = (0..48)
            .map(|i| row(start + i * HOUR, "Wi-Fi", 120 * MB))
            .collect();

        assert!(detect_anomalies(&rows, 0, start + 60 * HOUR).is_empty());
    }

    #[test]
    fn classifies_overnight_traffic_as_night() {
        let day = 1_700_000_000 - (1_700_000_000 % DAY);
        let quiet: Vec<HourRow> = (0..72)
            .map(|i| row(day + i * HOUR, "Wi-Fi", MB))
            .collect();
        let night_ts = day + 2 * HOUR;
        let mut rows = quiet;
        rows.push(row(night_ts, "Wi-Fi", 300 * MB));

        let found = detect_anomalies(&rows, 0, day + 96 * HOUR);

        let hit = found.iter().find(|a| a.ts == night_ts).expect("night");
        assert_eq!(hit.kind, "night");
    }

    #[test]
    fn excludes_the_running_hour() {
        let start = 1_700_000_000 - (1_700_000_000 % HOUR);
        let mut rows: Vec<HourRow> = (0..10)
            .map(|i| row(start + i * HOUR, "Wi-Fi", MB))
            .collect();
        let running_hour = start + 10 * HOUR;
        rows.push(row(running_hour, "Wi-Fi", 900 * MB));

        let found = detect_anomalies(&rows, 0, running_hour + 120);
        assert!(found.iter().all(|a| a.ts != running_hour));
    }
}
