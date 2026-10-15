use std::collections::HashMap;

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::Anomaly;
use crate::state::Config;

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
            dismissed  INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_anomalies_active
            ON anomalies (dismissed, ts DESC);",
    )?;
    Ok(conn)
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

pub fn cumulative(conn: &Connection) -> Result<HashMap<String, (u64, u64, i64)>, AppError> {
    let mut stmt = conn.prepare("SELECT iface, rx, tx, ts FROM iface_cumulative")?;
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
            _ => {}
        }
    }
    Ok(config)
}

pub fn save_config(conn: &Connection, config: &Config) -> Result<(), AppError> {
    let pairs = [
        ("refresh_ms", config.refresh_ms.to_string()),
        ("quota_gb", config.quota_gb.to_string()),
        ("reset_day", config.reset_day.to_string()),
        ("minimize_to_tray", config.minimize_to_tray.to_string()),
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
    let changed = conn.execute(
        "INSERT OR IGNORE INTO anomalies
            (ts, kind, iface, bytes, baseline, ratio, severity, message, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            anomaly.ts,
            anomaly.kind,
            anomaly.iface,
            anomaly.bytes as i64,
            anomaly.baseline as i64,
            anomaly.ratio,
            anomaly.severity,
            anomaly.message,
            created_at,
        ],
    )?;
    Ok(changed > 0)
}

pub fn list_anomalies(conn: &Connection, limit: u32) -> Result<Vec<Anomaly>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, ts, iface, bytes, baseline, ratio, severity, message
         FROM anomalies
         WHERE dismissed = 0
         ORDER BY ts DESC, id DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit.clamp(1, 500) as i64], |row| {
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
