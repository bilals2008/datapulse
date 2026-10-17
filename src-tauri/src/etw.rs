//! Per-process network attribution from a real-time ETW session on
//! `Microsoft-Windows-TCPIP`.
//!
//! The provider reports every IPv4 packet crossing the stack grid. Send events
//! name the owning process in the event header; receive events are raised by
//! `System`, so those are resolved through the connection table (`conns.rs`).
//!
//! Needs an elevated process: unelevated `StartTraceW` is refused with
//! ERROR_ACCESS_DENIED. Everything degrades to "no data" when it cannot start.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use windows::core::{GUID, PCWSTR, PWSTR};
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Diagnostics::Etw::{
    ControlTraceW, EnableTraceEx2, EVENT_RECORD, EVENT_TRACE_CONTROL_STOP, EVENT_TRACE_LOGFILEW,
    EVENT_TRACE_PROPERTIES, EVENT_TRACE_REAL_TIME_MODE, OpenTraceW, ProcessTrace,
    PROCESS_TRACE_MODE_EVENT_RECORD, StartTraceW, CONTROLTRACE_HANDLE,
};

use crate::conns::{self, ConnKey};

const PROVIDER: GUID = GUID::from_values(
    0x2f07_2ee1,
    0x15db,
    0x40f1,
    [0x90, 0xef, 0x9d, 0x7b, 0xa2, 0x82, 0x18, 0x8a],
);

const SESSION_NAME: &str = "DataPulseApps";

/// `sizeof(EVENT_TRACE_PROPERTIES)` on x64.
const PROPS_SIZE: usize = 120;

/// Consumer callback threading: ETW delivers on its own processor thread.
const PROCESSOR_MODE: u32 = 0x0010_0000;

/// Largest packet accepted from a grid event. Jumbo frames are ~64 KB, so
/// anything larger is a misparsed field rather than traffic.
const MAX_PACKET: u32 = 1024 * 1024;

const PROTO_TCP: u32 = 6;
const PROTO_UDP: u32 = 17;

/// Payload layout shared by the TCP and UDP grid events, captured from the
/// provider on Windows 11:
///
/// ```text
/// 0  u32 local IPv4    4  u16 local port   6  u16 0xFFFF
/// 8  u32 flags        12 u32 packet size 16 u32 protocol
/// 20 u32 remote IPv4  24 u16 remote port
/// 56 u32 owning process id
/// ```
const OFF_LOCAL_IPV4: usize = 0;
const OFF_LOCAL_PORT: usize = 4;
const OFF_SIZE: usize = 12;
const OFF_PROTO: usize = 16;
const OFF_PID: usize = 56;

/// System raises receive events, so a header pid of 4 (or 0) means "look it up".
const SYSTEM_PID: u32 = 4;

type Acc = HashMap<u32, (u64, u64)>;

static ACC: OnceLock<Mutex<Acc>> = OnceLock::new();
static SESSION: OnceLock<Mutex<u64>> = OnceLock::new();
static PACKETS: AtomicU64 = AtomicU64::new(0);
static ATTRIBUTED: AtomicU64 = AtomicU64::new(0);
static ORPHANS: AtomicU64 = AtomicU64::new(0);

fn acc() -> &'static Mutex<Acc> {
    ACC.get_or_init(|| Mutex::new(HashMap::new()))
}

fn session_slot() -> &'static Mutex<u64> {
    SESSION.get_or_init(|| Mutex::new(0))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn read_u16(bytes: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([bytes[off], bytes[off + 1]])
}

fn read_u32(bytes: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([
        bytes[off],
        bytes[off + 1],
        bytes[off + 2],
        bytes[off + 3],
    ])
}

unsafe extern "system" fn on_event(record: *mut EVENT_RECORD) {
    // A panic crossing the ETW callback boundary aborts the process, so the body
    // is panic-free and its failures are swallowed.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        on_event_inner(record)
    }));
}

unsafe fn on_event_inner(record: *mut EVENT_RECORD) {
    if record.is_null() {
        return;
    }
    let event = unsafe { &*record };
    if event.UserData.is_null() {
        return;
    }

    let len = event.UserDataLength as usize;
    let bytes = unsafe { std::slice::from_raw_parts(event.UserData as *const u8, len) };
    if len < OFF_PID + 4 {
        return;
    }

    let proto = read_u32(bytes, OFF_PROTO);
    if proto != PROTO_TCP && proto != PROTO_UDP {
        return;
    }
    let size = read_u32(bytes, OFF_SIZE);
    if size == 0 || size > MAX_PACKET {
        return;
    }

    let header_pid = event.EventHeader.ProcessId;
    let sending = header_pid != 0 && header_pid != SYSTEM_PID;
    PACKETS.fetch_add(1, Ordering::Relaxed);
    let pid = if sending {
        header_pid
    } else {
        match payload_pid(bytes).or_else(|| conns::owner(&ConnKey {
            addr: read_u32(bytes, OFF_LOCAL_IPV4),
            port: read_u16(bytes, OFF_LOCAL_PORT),
        })) {
            Some(pid) => pid,
            None => {
                ORPHANS.fetch_add(1, Ordering::Relaxed);
                return;
            }
        }
    };
    ATTRIBUTED.fetch_add(1, Ordering::Relaxed);

    let mut map = acc().lock().unwrap_or_else(|err| err.into_inner());
    let slot = map.entry(pid).or_insert((0, 0));
    if sending {
        slot.1 += size as u64;
    } else {
        slot.0 += size as u64;
    }
}

fn payload_pid(bytes: &[u8]) -> Option<u32> {
    let pid = read_u32(bytes, OFF_PID);
    (pid != 0 && pid != SYSTEM_PID).then_some(pid)
}

/// A session GUID already in use makes StartTrace fail with
/// ERROR_ALREADY_EXISTS, so every launch needs its own.
fn random_guid() -> GUID {
    let mut mix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(1) as u64
        ^ ((std::process::id() as u64) << 32)
        ^ 0x9e37_79b9_7f4a_7c15;
    let mut next = move || {
        mix ^= mix << 13;
        mix ^= mix >> 7;
        mix ^= mix << 17;
        (mix >> 32) as u32
    };
    GUID::from_values(
        next(),
        (next() & 0xffff) as u16,
        (next() & 0xffff) as u16,
        [
            next() as u8,
            next() as u8,
            next() as u8,
            next() as u8,
            next() as u8,
            next() as u8,
            next() as u8,
            next() as u8,
        ],
    )
}

/// Starts the trace session. `None` means per-app data stays unavailable.
///
/// ETW wants the properties buffer to hold the struct *plus* room for a copy of
/// the session name; a buffer of exactly `PROPS_SIZE` is rejected with
/// ERROR_BAD_LENGTH.
fn start_session(name: &[u16]) -> Option<u64> {
    let total = PROPS_SIZE + ((name.len() * 2 + 1 + 7) & !7);

    let mut props = EVENT_TRACE_PROPERTIES::default();
    props.Wnode.BufferSize = total as u32;
    props.Wnode.Anonymous1.Anonymous.Version = 1;
    props.Wnode.Guid = random_guid();
    props.LogFileMode = EVENT_TRACE_REAL_TIME_MODE;
    props.BufferSize = 1024;
    props.MinimumBuffers = 8;
    props.MaximumBuffers = 16;
    props.FlushTimer = 1;

    let mut raw = vec![0u8; total];
    unsafe {
        std::ptr::copy_nonoverlapping(
            &props as *const _ as *const u8,
            raw.as_mut_ptr(),
            PROPS_SIZE,
        );
    }

    let mut handle = CONTROLTRACE_HANDLE { Value: 0 };
    let rc = unsafe { StartTraceW(&mut handle, PCWSTR(name.as_ptr()), raw.as_mut_ptr().cast()) };
    (rc == ERROR_SUCCESS).then_some(handle.Value)
}

/// Starts the session, the provider and the consumer thread. `false` means the
/// caller should treat per-app data as unavailable.
pub fn spawn() -> bool {
    let name = wide(SESSION_NAME);
    let Some(handle) = start_session(&name) else {
        return false;
    };
    *session_slot().lock().unwrap() = handle;

    // shortcut: on this Windows build EnableTraceEx2 reports success but the
    // provider never writes to the session, while `logman update` does. Both are
    // issued so the feature survives a future build that fixes the direct call.
    unsafe {
        let _ = EnableTraceEx2(
            CONTROLTRACE_HANDLE { Value: handle },
            &PROVIDER,
            1,
            u8::MAX,
            u64::MAX,
            u64::MAX,
            0,
            None,
        );
    }
    let _ = std::process::Command::new("logman")
        .args([
            "update",
            "trace",
            SESSION_NAME,
            "-p",
            "Microsoft-Windows-TCPIP",
            "-ets",
        ])
        .output();

    conns::spawn();

    std::thread::spawn(move || {
        let mut logfile = EVENT_TRACE_LOGFILEW {
            LoggerName: PWSTR(name.as_ptr() as *mut u16),
            ..Default::default()
        };
        logfile.Anonymous1.LogFileMode =
            EVENT_TRACE_REAL_TIME_MODE | PROCESS_TRACE_MODE_EVENT_RECORD | PROCESSOR_MODE;
        logfile.Anonymous2.EventRecordCallback = Some(on_event);

        let consumer = unsafe { OpenTraceW(&mut logfile) };
        if consumer.Value == u64::MAX {
            return;
        }
        let _ = unsafe { ProcessTrace(&[consumer], None, None) };
    });

    true
}

/// Stops the session so no ETW session is left behind after exit.
pub fn stop() {
    let handle = *session_slot().lock().unwrap();
    if handle == 0 {
        return;
    }

    let mut props = EVENT_TRACE_PROPERTIES::default();
    props.Wnode.BufferSize = (PROPS_SIZE + 64) as u32;
    props.Wnode.Anonymous1.Anonymous.Version = 1;
    unsafe {
        let _ = ControlTraceW(
            CONTROLTRACE_HANDLE { Value: handle },
            PCWSTR::null(),
            &mut props as *mut EVENT_TRACE_PROPERTIES,
            EVENT_TRACE_CONTROL_STOP,
        );
    }
    let _ = std::process::Command::new("logman")
        .args(["stop", SESSION_NAME, "-ets"])
        .output();
    *session_slot().lock().unwrap() = 0;
}

/// Everything counted since the last call, as `(pid, (down, up))`.
pub fn drain() -> Acc {
    std::mem::take(&mut *acc().lock().unwrap())
}

/// Live counters for the Applications page: packets seen, packets that reached
/// an application, and packets whose owner was unknown.
pub fn stats() -> (u64, u64, u64) {
    (
        PACKETS.load(Ordering::Relaxed),
        ATTRIBUTED.load(Ordering::Relaxed),
        ORPHANS.load(Ordering::Relaxed),
    )
}
