use std::collections::HashMap;

use crate::models::ForecastPoint;

const DAY: i64 = 86_400;
const HISTORY_DAYS: i64 = 90;
/// Finite sentinel used instead of infinity so it survives JSON serialization.
pub const FAR_FUTURE_DAYS: f64 = 9_999.0;

/// Weekday-aware spend projection for the current quota period.
#[derive(Debug, Clone)]
pub struct Forecast {
    pub avg_daily: u64,
    pub daily_budget: u64,
    pub projected: u64,
    pub days_to_limit: f64,
    pub over_budget: bool,
    pub burn: Vec<ForecastPoint>,
}

/// Project how much data the current period will end on.
///
/// `daily` holds `(local_day_start, bytes)` pairs for recent history. Days before
/// `today` build a per-weekday profile; remaining period days are filled with the
/// matching weekday average (falling back to the overall average).
pub fn forecast(
    daily: &[(i64, u64)],
    period_start: i64,
    period_end: i64,
    today: i64,
    used: u64,
    limit: u64,
    tz_offset: i32,
) -> Forecast {
    let days_total = ((period_end - period_start) / DAY).max(1);
    let today_index = ((today - period_start) / DAY).clamp(0, days_total - 1);

    let mut by_day: HashMap<i64, u64> = HashMap::with_capacity(daily.len());
    let mut weekday_sum = [0_u64; 7];
    let mut weekday_count = [0_u64; 7];
    let mut history_total = 0_u64;
    let mut history_count = 0_u64;

    for (day, bytes) in daily {
        by_day.insert(*day, *bytes);
        if *day < today {
            let weekday = weekday_index(*day, tz_offset);
            weekday_sum[weekday] += *bytes;
            weekday_count[weekday] += 1;
            history_total += *bytes;
            history_count += 1;
        }
    }

    let overall_avg = history_total.checked_div(history_count).unwrap_or(0);
    let weekday_avg = |day: i64| -> u64 {
        let weekday = weekday_index(day, tz_offset);
        weekday_sum[weekday]
            .checked_div(weekday_count[weekday])
            .unwrap_or(overall_avg)
    };

    let daily_budget = limit / days_total as u64;
    let mut projected = used;
    let mut burn = Vec::with_capacity(days_total as usize);
    let mut cum_actual = 0_u64;
    let mut cum_projected = 0_u64;

    for index in 0..days_total {
        let day = period_start + index * DAY;
        if index <= today_index {
            cum_actual += by_day.get(&day).copied().unwrap_or(0);
            cum_projected = cum_actual;
        } else {
            cum_projected += weekday_avg(day);
            projected += weekday_avg(day);
        }

        burn.push(ForecastPoint {
            ts: day,
            actual: if index <= today_index { cum_actual } else { 0 },
            projected: cum_projected,
            budget: daily_budget * (index as u64 + 1),
        });
    }

    // With no usable history, fall back to a flat extrapolation of what we have.
    if history_count == 0 {
        let started = (today_index + 1) as u64;
        projected = used * days_total as u64 / started.max(1);
    }

    let elapsed_days = (today_index as u64 + 1).max(1);
    let avg_daily = used / elapsed_days;
    let days_to_limit = if used >= limit {
        0.0
    } else if avg_daily > 0 {
        (limit - used) as f64 / avg_daily as f64
    } else {
        FAR_FUTURE_DAYS
    };

    Forecast {
        avg_daily,
        daily_budget,
        projected,
        days_to_limit,
        over_budget: projected > limit,
        burn,
    }
}

/// History window (in seconds) worth of day buckets to feed the profile.
pub fn history_lookback_secs() -> i64 {
    HISTORY_DAYS * DAY
}

fn weekday_index(day: i64, tz_offset: i32) -> usize {
    let epoch_days = (day + tz_offset as i64).div_euclid(DAY);
    ((epoch_days + 4).rem_euclid(7)) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    const GIB: u64 = 1024 * 1024 * 1024;

    #[test]
    fn extrapolates_linearly_without_history() {
        let period_start = 1_700_000_000 - (1_700_000_000 % DAY);
        let period_end = period_start + 30 * DAY;
        let today = period_start + 9 * DAY;

        let result = forecast(
            &[],
            period_start,
            period_end,
            today,
            10 * GIB,
            100 * GIB,
            0,
        );

        assert_eq!(result.avg_daily, GIB);
        assert_eq!(result.projected, 30 * GIB);
        assert_eq!(result.burn.len(), 30);
        assert!(!result.over_budget);
    }

    #[test]
    fn flags_over_budget_when_history_is_high() {
        let period_start = 1_700_000_000 - (1_700_000_000 % DAY);
        let period_end = period_start + 30 * DAY;
        let today = period_start + 5 * DAY;

        let history: Vec<(i64, u64)> = (0..30)
            .map(|i| (period_start - (30 - i) * DAY, 5 * GIB))
            .collect();

        let result = forecast(
            &history,
            period_start,
            period_end,
            today,
            25 * GIB,
            100 * GIB,
            0,
        );

        assert!(result.over_budget);
        assert_eq!(result.avg_daily, (25 * GIB) / 6);
    }

    #[test]
    fn budget_tracks_daily_allowance() {
        let period_start = 0;
        let period_end = 30 * DAY;
        let result = forecast(&[], period_start, period_end, period_start, 0, 30 * GIB, 0);

        assert_eq!(result.daily_budget, GIB);
        assert_eq!(result.burn.first().unwrap().budget, GIB);
        assert_eq!(result.burn.last().unwrap().budget, 30 * GIB);
    }
}
