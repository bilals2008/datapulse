use std::collections::{HashMap, HashSet};
use std::thread;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::models::ProcessSample;

const TOP_N: usize = 5;

/// The busiest processes right now.
///
/// Sampling CPU needs two readings at least `MINIMUM_CPU_UPDATE_INTERVAL` apart
/// and this sleeps for that long, so callers run it off the collector thread.
pub fn top_processes() -> Vec<ProcessSample> {
    let mut system = System::new_all();
    thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut samples: Vec<ProcessSample> = system
        .processes()
        .values()
        .filter(|process| !process.name().is_empty())
        .map(|process| ProcessSample {
            name: process.name().to_string_lossy().into_owned(),
            cpu: process.cpu_usage() as f64,
            disk_written: process.disk_usage().total_written_bytes,
        })
        .filter(|sample| sample.cpu > 0.0 || sample.disk_written > 0)
        .collect();

    samples.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.disk_written.cmp(&a.disk_written))
    });
    samples.truncate(TOP_N);
    samples
}

/// An application behind a process id.
#[derive(Debug, Clone)]
pub struct AppIdentity {
    pub key: String,
    pub name: String,
    pub path: String,
}

/// Maps the process ids seen in a network tick to the application behind them.
///
/// Only the requested pids are refreshed, so this stays cheap enough for the
/// collector's flush interval.
pub fn resolve(pids: &HashSet<u32>) -> HashMap<u32, AppIdentity> {
    let mut out = HashMap::new();
    if pids.is_empty() {
        return out;
    }

    let list: Vec<Pid> = pids.iter().map(|pid| Pid::from(*pid as usize)).collect();
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&list),
        true,
        ProcessRefreshKind::nothing(),
    );

    for pid in pids.iter().copied() {
        let Some(process) = system.process(Pid::from(pid as usize)) else {
            continue;
        };
        let name = process.name().to_string_lossy().into_owned();
        if name.is_empty() {
            continue;
        }
        let path = process.exe().map(|exe| exe.to_string_lossy().into_owned());
        out.insert(pid, identity(name, path.as_deref()));
    }
    out
}

/// Applications are keyed by their executable path so two copies of the same
/// program stay one row; processes without a path fall back to their name.
pub fn identity(name: String, path: Option<&str>) -> AppIdentity {
    match path.filter(|p| !p.is_empty()) {
        Some(path) => AppIdentity {
            key: path.to_lowercase(),
            name,
            path: path.to_string(),
        },
        None => AppIdentity {
            key: name.to_lowercase(),
            name,
            path: String::new(),
        },
    }
}

