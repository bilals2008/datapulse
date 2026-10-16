/// Length of the recommended quiet stretch, in hours.
pub const WINDOW_HOURS: u32 = 4;

/// Spreads sparse `(hour_of_day, bytes)` rows into a zero-filled 24-slot day.
pub fn hourly_average(rows: &[(u32, u64)]) -> [u64; 24] {
    let mut day = [0_u64; 24];
    for (hour, bytes) in rows {
        if let Some(slot) = day.get_mut(*hour as usize) {
            *slot = *bytes;
        }
    }
    day
}

/// Start hour and average bytes-per-hour of the quietest wrapping window.
///
/// Ties keep the earliest hour so the answer does not jump around between polls.
pub fn quietest_window(day: &[u64; 24]) -> (u32, u64) {
    let mut best_start = 0;
    let mut best_total = u64::MAX;

    for start in 0..24_u32 {
        let total: u64 = (0..WINDOW_HOURS)
            .map(|offset| day[((start + offset) % 24) as usize])
            .fold(0, u64::saturating_add);

        if total < best_total {
            best_total = total;
            best_start = start;
        }
    }

    (best_start, best_total / WINDOW_HOURS as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_quiet_block() {
        let mut day = [900_u64; 24];
        for hour in 2..6 {
            day[hour] = 10;
        }

        let (start, per_hour) = quietest_window(&day);
        assert_eq!(start, 2);
        assert_eq!(per_hour, 10);
    }

    #[test]
    fn window_wraps_past_midnight() {
        let mut day = [900_u64; 24];
        for hour in [22, 23, 0, 1] {
            day[hour] = 5;
        }

        let (start, per_hour) = quietest_window(&day);
        assert_eq!(start, 22);
        assert_eq!(per_hour, 5);
    }

    #[test]
    fn zero_fills_missing_hours() {
        let day = hourly_average(&[(3, 42)]);
        assert_eq!(day[3], 42);
        assert_eq!(day[4], 0);
        assert_eq!(day.len(), 24);
    }
}
