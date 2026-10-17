use std::collections::HashMap;

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::{Anomaly, SpeedSample};
use crate::state::Config;

/// Speed samples are kept for 90 days.
const SPEED_RETENTION_SECS: i64 = 90 * 86_400;

pub fn open(path: &std::path::Path) -> Result<Connection, AppError> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA busy_timeout=5000;
         CREATE TABLE IF NOT EXISTS usage_minute (
            ts_min INTEGER NOT NULL,
            iface  TEXT NOT NULL,
            rx     INTEGER NOT NULL DEFAULT 0,
            tx     INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ts_min, iface)
         );
         CREATE TABLE IF NOT EXISTS iface_cumulative (
            iface TEXT PRIMARY KEY,
            rx    INTEGER NOT NULL,
            tx    INTEGER NOT NULL,
            ts    INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS anomalies (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ts         INTEGER NOT NULL UNIQUE,
            kind       TEXT NOT NULL,
            iface      TEXT NOT NULL DEFAULT '',
            bytes      INTEGER NOT NULL DEFAULT 0,
            baseline   INTEGER NOT NULL DEFAULT 0,
            ratio      REAL NOT NULL DEFAULT 0,
            severity   TEXT NOT NULL DEFAULT 'low',
            message    TEXT NOT NULL DEFAULT '',
            procs      TEXT NOT NULL DEFAULT '[]',
            dismissed  INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_anomalies_active
            ON anomalies (dismissed, ts DESC);
         CREATE TABLE IF NOT EXISTS speed_samples (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ts         INTEGER NOT NULL,
            down_bps   REAL NOT NULL DEFAULT 0,
            latency_ms REAL NOT NULL DEFAULT 0,
            bytes      INTEGER NOT NULL DEFAULT 0,
            ok         INTEGER NOT NULL DEFAULT 1,
            error      TEXT NOT NULL DEFAULT ''
         );
         CREATE INDEX IF NOT EXISTS idx_speed_ts ON speed_samples (ts DESC);",
    )?;

    // The per-app tables went with the Applications view; drop them so old
    // databases do not keep rows nothing reads.
    conn.execute_batch("DROP TABLE IF EXISTS app_usage_minute; DROP TABLE IF EXISTS apps;")?;

    ensure_column(&conn, "anomalies", "procs", "TEXT NOT NULL DEFAULT '[]'")?;
    Ok(conn)
}

/// Adds a column to an existing table when an older database lacks it.
fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info(?1) WHERE name = ?2",
        params![table, column],
        |row| row.get(0),
    )?;

    if exists == 0 {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"))?;
    }
    Ok(())
}

pub fn insert_usage(
    conn: &Connection,
    ts_min: i64,
    iface: &str,
    rx: u64,
    tx: u64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO usage_minute (ts_min, iface, rx, tx) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(ts_min, iface) DO UPDATE SET
            rx = usage_minute.rx + excluded.rx,
            tx = usage_minute.tx + excluded.tx",
        params![ts_min, iface, rx as i64, tx as i64],
    )?;
    Ok(())
}

pub fn usage_since(conn: &Connection, since: i64) -> Result<(u64, u64), AppError> {
    let (rx, tx): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0) FROM usage_minute WHERE ts_min >= ?1",
        params![since],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok((rx.max(0) as u64, tx.max(0) as u64))
}

pub fn series(
    conn: &Connection,
    format: &str,
    since: i64,
    tz_offset: i32,
) -> Result<HashMap<String, (u64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT strftime(?1, ts_min + ?2, 'unixepoch') AS bucket,
                COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?3
         GROUP BY bucket",
    )?;
    let rows = stmt.query_map(params![format, tz_offset, since], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (key, rx, tx) = row?;
        map.insert(key, (rx.max(0) as u64, tx.max(0) as u64));
    }
    Ok(map)
}

pub fn interface_totals(
    conn: &Connection,
    since: i64,
) -> Result<Vec<(String, u64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT iface, COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?1
         GROUP BY iface
         ORDER BY SUM(rx) + SUM(tx) DESC",
    )?;
    let rows = stmt.query_map(params![since], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (name, rx, tx) = row?;
        out.push((name, rx.max(0) as u64, tx.max(0) as u64));
    }
    Ok(out)
}

pub fn cumulative(conn: &Connection) -> Result<HashMap<String, (u64, u64, i64)>, AppError> {    let mut stmt = conn.prepare("SELECT iface, rx, tx, ts FROM iface_cumulative")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (name, rx, tx, ts) = row?;
        map.insert(name, (rx.max(0) as u64, tx.max(0) as u64, ts));
    }
    Ok(map)
}

pub fn upsert_cumulative(
    conn: &Connection,
    iface: &str,
    rx: u64,
    tx: u64,
    ts: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO iface_cumulative (iface, rx, tx, ts) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(iface) DO UPDATE SET rx = excluded.rx, tx = excluded.tx, ts = excluded.ts",
        params![iface, rx as i64, tx as i64, ts],
    )?;
    Ok(())
}

pub fn clear_all(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("DELETE FROM usage_minute; DELETE FROM iface_cumulative;")?;
    Ok(())
}

pub fn load_config(conn: &Connection) -> Result<Config, AppError> {
    let mut config = Config::default();
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (key, value) = row?;
        match key.as_str() {
            "refresh_ms" => {
                if let Ok(parsed) = value.parse() {
                    config.refresh_ms = parsed;
                }
            }
            "quota_gb" => {
                if let Ok(parsed) = value.parse() {
                    config.quota_gb = parsed;
                }
            }
            "reset_day" => {
                if let Ok(parsed) = value.parse() {
                    config.reset_day = parsed;
                }
            }
            "minimize_to_tray" => {
                if let Ok(parsed) = value.parse() {
                    config.minimize_to_tray = parsed;
                }
            }
            "auto_check_updates" => {
                if let Ok(parsed) = value.parse() {
                    config.auto_check_updates = parsed;
                }
            }
            "rate_per_gb" => {
                if let Ok(parsed) = value.parse() {
                    config.rate_per_gb = parsed;
                }
            }
            "currency" => config.currency = value,
            "speedtest_enabled" => {
                if let Ok(parsed) = value.parse() {
                    config.speedtest_enabled = parsed;
                }
            }
            "lan_enabled" => {
                if let Ok(parsed) = value.parse() {
                    config.lan_enabled = parsed;
                }
            }
            "lan_token" => config.lan_token = value,
            _ => {}
        }
    }
    Ok(config)
}

/// Reads a single `settings` row; used for state that is not part of the
/// frontend's settings contract, such as where the tiny HUD sits.
pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn save_config(conn: &Connection, config: &Config) -> Result<(), AppError> {
    let pairs = [
        ("refresh_ms", config.refresh_ms.to_string()),
        ("quota_gb", config.quota_gb.to_string()),
        ("reset_day", config.reset_day.to_string()),
        ("minimize_to_tray", config.minimize_to_tray.to_string()),
        ("auto_check_updates", config.auto_check_updates.to_string()),
        ("rate_per_gb", config.rate_per_gb.to_string()),
        ("currency", config.currency.clone()),
        ("speedtest_enabled", config.speedtest_enabled.to_string()),
        ("lan_enabled", config.lan_enabled.to_string()),
        ("lan_token", config.lan_token.clone()),
    ];
    for (key, value) in pairs {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
    }
    Ok(())
}

pub fn hourly_by_iface(
    conn: &Connection,
    since: i64,
    tz_offset: i32,
) -> Result<Vec<(i64, String, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT (ts_min + ?1) - ((ts_min + ?1) % 3600) - ?1 AS h,
                iface,
                COALESCE(SUM(rx + tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?2
         GROUP BY h, iface
         ORDER BY h",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, since], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn daily_totals(
    conn: &Connection,
    since: i64,
    tz_offset: i32,
) -> Result<Vec<(i64, u64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT (ts_min + ?1) - ((ts_min + ?1) % 86400) - ?1 AS d,
                COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?2
         GROUP BY d
         ORDER BY d",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, since], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?.max(0) as u64,
            row.get::<_, i64>(2)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Total transfer per local hour-of-day (0â€“23), collapsed across the span.
pub fn hourly_totals(
    conn: &Connection,
    since: i64,
    tz_offset: i32,
) -> Result<Vec<(u32, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT ((ts_min + ?1) % 86400) / 3600 AS hod,
                COALESCE(SUM(rx + tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?2
         GROUP BY hod
         ORDER BY hod",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, since], |row| {
        Ok((
            row.get::<_, i64>(0)?.clamp(0, 23) as u32,
            row.get::<_, i64>(1)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn daily_by_day(
    conn: &Connection,
    since: i64,
    tz_offset: i32,
) -> Result<Vec<(i64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT (ts_min + ?1) - ((ts_min + ?1) % 86400) - ?1 AS d,
                COALESCE(SUM(rx + tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?2
         GROUP BY d
         ORDER BY d",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, since], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?.max(0) as u64))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn buckets(
    conn: &Connection,
    start: i64,
    end: i64,
    step: i64,
    tz_offset: i32,
) -> Result<Vec<(i64, u64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT (ts_min + ?1) - ((ts_min + ?1) % ?2) - ?1 AS b,
                COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?3 AND ts_min < ?4
         GROUP BY b
         ORDER BY b",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, step, start, end], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?.max(0) as u64,
            row.get::<_, i64>(2)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn interface_totals_between(
    conn: &Connection,
    start: i64,
    end: i64,
) -> Result<Vec<(String, u64, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT iface, COALESCE(SUM(rx), 0), COALESCE(SUM(tx), 0)
         FROM usage_minute
         WHERE ts_min >= ?1 AND ts_min < ?2
         GROUP BY iface
         ORDER BY SUM(rx) + SUM(tx) DESC",
    )?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?.max(0) as u64,
            row.get::<_, i64>(2)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn insert_anomaly(
    conn: &Connection,
    anomaly: &Anomaly,
    created_at: i64,
) -> Result<bool, AppError> {
    let procs = serde_json::to_string(&anomaly.procs).unwrap_or_else(|_| "[]".to_string());
    let changed = conn.execute(
        "INSERT OR IGNORE INTO anomalies
            (ts, kind, iface, bytes, baseline, ratio, severity, message, procs, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            anomaly.ts,
            anomaly.kind,
            anomaly.iface,
            anomaly.bytes as i64,
            anomaly.baseline as i64,
            anomaly.ratio,
            anomaly.severity,
            anomaly.message,
            procs,
            created_at,
        ],
    )?;
    Ok(changed > 0)
}

pub fn list_anomalies(conn: &Connection, limit: u32) -> Result<Vec<Anomaly>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, ts, iface, bytes, baseline, ratio, severity, message, procs
         FROM anomalies
         WHERE dismissed = 0
         ORDER BY ts DESC, id DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit.clamp(1, 500) as i64], |row| {
        let procs: String = row.get(9)?;
        Ok(Anomaly {
            id: row.get(0)?,
            kind: row.get(1)?,
            ts: row.get(2)?,
            iface: row.get(3)?,
            bytes: row.get::<_, i64>(4)?.max(0) as u64,
            baseline: row.get::<_, i64>(5)?.max(0) as u64,
            ratio: row.get(6)?,
            severity: row.get(7)?,
            message: row.get(8)?,
            procs: serde_json::from_str(&procs).unwrap_or_default(),
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn dismiss_anomaly(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("UPDATE anomalies SET dismissed = 1 WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn dismiss_all_anomalies(conn: &Connection) -> Result<(), AppError> {
    conn.execute("UPDATE anomalies SET dismissed = 1 WHERE dismissed = 0", [])?;
    Ok(())
}

pub fn prune_anomalies(conn: &Connection, before: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM anomalies WHERE ts < ?1", params![before])?;
    Ok(())
}

pub fn insert_speed_sample(conn: &Connection, sample: &SpeedSample) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO speed_samples (ts, down_bps, latency_ms, bytes, ok, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            sample.ts,
            sample.down_bps,
            sample.latency_ms,
            sample.bytes as i64,
            sample.ok as i64,
            sample.error,
        ],
    )?;
    conn.execute("DELETE FROM speed_samples WHERE ts < ?1", params![
        sample.ts - SPEED_RETENTION_SECS
    ])?;
    Ok(())
}

pub fn latest_speed_sample(conn: &Connection) -> Result<Option<SpeedSample>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT ts, down_bps, latency_ms, bytes, ok, error FROM speed_samples
         ORDER BY ts DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map([], map_speed_sample)?;
    rows.next().transpose().map_err(AppError::from)
}

pub fn speed_samples_since(conn: &Connection, since: i64) -> Result<Vec<SpeedSample>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT ts, down_bps, latency_ms, bytes, ok, error FROM speed_samples
         WHERE ts >= ?1 ORDER BY ts",
    )?;
    let rows = stmt.query_map(params![since], map_speed_sample)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn map_speed_sample(row: &rusqlite::Row<'_>) -> rusqlite::Result<SpeedSample> {
    Ok(SpeedSample {
        ts: row.get(0)?,
        down_bps: row.get(1)?,
        latency_ms: row.get(2)?,
        bytes: row.get::<_, i64>(3)?.max(0) as u64,
        ok: row.get::<_, i64>(4)? != 0,
        error: row.get(5)?,
    })
}

/// Transfer per local hour-of-day averaged over the given window.
pub fn average_hourly(
    conn: &Connection,
    since: i64,
    tz_offset: i32,
) -> Result<Vec<(u32, u64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT ((ts_min + ?1) % 86400) / 3600 AS hod,
                COALESCE(SUM(rx + tx), 0) / COUNT(DISTINCT ((ts_min + ?1) / 86400)) AS avg_bytes
         FROM usage_minute
         WHERE ts_min >= ?2
         GROUP BY hod
         ORDER BY hod",
    )?;
    let rows = stmt.query_map(params![tz_offset as i64, since], |row| {
        Ok((
            row.get::<_, i64>(0)?.clamp(0, 23) as u32,
            row.get::<_, i64>(1)?.max(0) as u64,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buckets_never_leave_the_window() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE usage_minute (
                ts_min INTEGER NOT NULL, iface TEXT NOT NULL,
                rx INTEGER NOT NULL DEFAULT 0, tx INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (ts_min, iface)
             );",
        )
        .unwrap();

        insert_usage(&conn, 1_700_000_000, "eth", 10, 5).unwrap();
        insert_usage(&conn, 1_704_000_000, "eth", 999, 999).unwrap();

        let rows = buckets(&conn, 1_699_000_000, 1_701_000_000, 86_400, 0).unwrap();
        let total: u64 = rows.iter().map(|(_, rx, tx)| rx + tx).sum();
        assert_eq!(total, 15);
    }
}