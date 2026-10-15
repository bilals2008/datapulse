mod anomaly;
mod forecast;

pub use anomaly::{detect_anomalies, HourRow};
pub use forecast::{forecast, history_lookback_secs, FAR_FUTURE_DAYS};

/// Seconds east of UTC for the machine's current local time.
pub fn local_offset_secs() -> i32 {
    chrono::Local::now().offset().local_minus_utc()
}

/// Human-readable byte size, e.g. `1.25 GB`.
pub fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 6] = ["B", "KB", "MB", "GB", "TB", "PB"];
    if bytes == 0 {
        return "0 B".to_string();
    }

    let mut value = bytes as f64;
    let mut index = 0;
    while value >= 1024.0 && index < UNITS.len() - 1 {
        value /= 1024.0;
        index += 1;
    }

    let digits = if index == 0 || value >= 100.0 {
        0
    } else if value >= 10.0 {
        1
    } else {
        2
    };

    format!("{value:.digits$} {}", UNITS[index])
}

/// Median of a slice using the upper-middle element for even lengths.
fn median(values: &[u64]) -> u64 {
    if values.is_empty() {
        return 0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sorted[sorted.len() / 2]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn human_bytes_scales_units() {
        assert_eq!(human_bytes(0), "0 B");
        assert_eq!(human_bytes(512), "512 B");
        assert_eq!(human_bytes(1024), "1.00 KB");
        assert_eq!(human_bytes(1024 * 1024 * 1024), "1.00 GB");
    }

    #[test]
    fn median_handles_empty_and_even_slices() {
        assert_eq!(median(&[]), 0);
        assert_eq!(median(&[5]), 5);
        assert_eq!(median(&[1, 2, 3, 4]), 3);
    }
}
