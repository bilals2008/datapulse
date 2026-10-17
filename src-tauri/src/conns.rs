//! A snapshot of which process owns each local socket, used to attribute
//! received packets (ETW raises those from `System`) back to an application.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCPTABLE_OWNER_PID, MIB_UDPTABLE_OWNER_PID,
    TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::AF_INET;

/// Local endpoint as both the ETW events and the socket tables spell it: the
/// IPv4 address as a network-order u32 and the port as a network-order u16.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct ConnKey {
    pub addr: u32,
    pub port: u16,
}

static TABLE: OnceLock<Mutex<HashMap<ConnKey, u32>>> = OnceLock::new();

fn table() -> &'static Mutex<HashMap<ConnKey, u32>> {
    TABLE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Looks up the process owning a local endpoint.
pub fn owner(key: &ConnKey) -> Option<u32> {
    let map = table().lock().unwrap_or_else(|err| err.into_inner());
    if let Some(pid) = map.get(key) {
        return Some(*pid);
    }
    // The two sources do not always agree on port byte order.
    map.get(&ConnKey {
        addr: key.addr,
        port: key.port.swap_bytes(),
    })
    .copied()
}

/// Keeps the endpoint table fresh on its own thread.
pub fn spawn() {
    std::thread::spawn(|| {
        loop {
            refresh();
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

fn refresh() {
    let mut map = HashMap::new();
    read_tcp(&mut map);
    read_udp(&mut map);
    *table().lock().unwrap() = map;
}

/// Two-call sizing dance every `GetExtended*Table` needs: ask with a null
/// buffer for the size, then read into a buffer of that size.
unsafe fn sized_len(fill: impl Fn(*mut u8, *mut u32) -> u32) -> Option<Vec<u8>> {
    let mut len = 0u32;
    if fill(std::ptr::null_mut(), &mut len) != ERROR_INSUFFICIENT_BUFFER.0 || len == 0 {
        return None;
    }
    let mut buffer = vec![0u8; len as usize];
    if fill(buffer.as_mut_ptr(), &mut len) != 0 {
        return None;
    }
    Some(buffer)
}

fn read_tcp(map: &mut HashMap<ConnKey, u32>) {
    let Some(buffer) = (unsafe {
        sized_len(|ptr, len| {
            GetExtendedTcpTable(
                Some(ptr.cast()),
                len,
                true,
                AF_INET.0 as u32,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        })
    }) else {
        return;
    };

    let table = unsafe { &*buffer.as_ptr().cast::<MIB_TCPTABLE_OWNER_PID>() };
    for row in table.table.iter().take(table.dwNumEntries as usize) {
        insert(map, row.dwLocalAddr, row.dwLocalPort, row.dwOwningPid);
    }
}

fn read_udp(map: &mut HashMap<ConnKey, u32>) {
    let Some(buffer) = (unsafe {
        sized_len(|ptr, len| {
            GetExtendedUdpTable(
                Some(ptr.cast()),
                len,
                true,
                AF_INET.0 as u32,
                UDP_TABLE_OWNER_PID,
                0,
            )
        })
    }) else {
        return;
    };

    let table = unsafe { &*buffer.as_ptr().cast::<MIB_UDPTABLE_OWNER_PID>() };
    for row in table.table.iter().take(table.dwNumEntries as usize) {
        insert(map, row.dwLocalAddr, row.dwLocalPort, row.dwOwningPid);
    }
}

/// A zero pid is not useful for attribution.
fn insert(map: &mut HashMap<ConnKey, u32>, addr: u32, port: u32, pid: u32) {
    if pid == 0 {
        return;
    }
    map.insert(
        ConnKey {
            addr,
            port: (port & 0xffff) as u16,
        },
        pid,
    );
}
