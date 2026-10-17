use std::thread;

use sysinfo::{ProcessesToUpdate, System};

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
