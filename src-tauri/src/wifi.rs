use crate::models::WifiInfo;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn read_wifi() -> Option<WifiInfo> {
    #[cfg(windows)]
    {
        read_wifi_windows()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn read_wifi_windows() -> Option<WifiInfo> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let output = Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);

    let mut ssid: Option<String> = None;
    let mut signal: u32 = 0;
    let mut radio_type = String::new();
    let mut channel = String::new();
    let mut rx_mbps: f64 = 0.0;
    let mut tx_mbps: f64 = 0.0;

    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "SSID" => ssid = Some(value.to_string()),
            "Signal" => {
                signal = value.trim_end_matches('%').trim().parse().unwrap_or(0);
            }
            "Radio type" => radio_type = value.to_string(),
            "Channel" => channel = value.to_string(),
            "Receive rate (Mbps)" => {
                rx_mbps = value.parse().unwrap_or(0.0);
            }
            "Transmit rate (Mbps)" => {
                tx_mbps = value.parse().unwrap_or(0.0);
            }
            _ => {}
        }
    }

    Some(WifiInfo {
        ssid: ssid?,
        signal_percent: signal,
        radio_type,
        channel,
        rx_mbps,
        tx_mbps,
    })
}
