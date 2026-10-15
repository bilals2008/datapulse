pub fn is_wireless(name: &str) -> bool {
    let lower = name.to_lowercase();
    ["wi-fi", "wifi", "wlan", "wireless", "802.11"]
        .iter()
        .any(|needle| lower.contains(needle))
}

pub fn is_loopback(name: &str) -> bool {
    name.to_lowercase().contains("loopback")
}
