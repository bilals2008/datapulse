use std::io::{Read, Write};
use std::net::{IpAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use crate::commands::{quota_status, usage_series};
use crate::state::AppState;

/// Fixed port: the dashboard URL is meant to be typed on a phone once.
pub const PORT: u16 = 7676;

const ACCEPT_POLL: Duration = Duration::from_millis(250);

/// Tiny read-only HTTP server for the LAN dashboard.
pub struct LanServer {
    stop: Arc<AtomicBool>,
    url: String,
}

impl LanServer {
    /// Binds the dashboard to the machine's LAN address. `None` when the host
    /// has no routable address or the port is already taken.
    pub fn start(state: Arc<AppState>, token: String) -> Option<Self> {
        if token.is_empty() {
            return None;
        }

        let ip = lan_address()?;
        let listener = TcpListener::bind((ip, PORT)).ok()?;
        listener.set_nonblocking(true).ok()?;

        let url = format!("http://{ip}:{PORT}/{token}");
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);

        thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => handle(stream, &state, &token),
                    Err(_) => thread::sleep(ACCEPT_POLL),
                }
            }
        });

        Some(Self { stop, url })
    }

    pub fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for LanServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// The address other devices on this network would use, without sending a packet.
fn lan_address() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback()).then_some(ip)
}

fn handle(mut stream: TcpStream, state: &Arc<AppState>, token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));

    let mut buf = [0_u8; 1024];
    let read = stream.read(&mut buf).unwrap_or(0);
    let request = String::from_utf8_lossy(&buf[..read]);
    let path = request.split_whitespace().nth(1).unwrap_or("");

    let (status, content_type, body) = match path.strip_prefix(&format!("/{token}")) {
        Some("/api/snapshot") => ("200 OK", "application/json", snapshot(state)),
        Some("/api/usage") => ("200 OK", "application/json", usage(state)),
        Some("") | Some("/") => (
            "200 OK",
            "text/html; charset=utf-8",
            PAGE.replace("__TOKEN__", token),
        ),
        _ => ("404 Not Found", "text/plain; charset=utf-8", "Not found".into()),
    };

    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );

    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

fn snapshot(state: &Arc<AppState>) -> String {
    let tick = state.latest.lock().unwrap().clone();
    let wifi = state.wifi.lock().unwrap().clone();
    let quota = quota_status(state).ok();

    serde_json::json!({ "tick": tick, "wifi": wifi, "quota": quota }).to_string()
}

/// Today's hourly buckets. The page polls this every 30 s, not every tick.
fn usage(state: &Arc<AppState>) -> String {
    match usage_series(state, "today") {
        Ok(series) => serde_json::to_string(&series).unwrap_or_else(|_| "{}".into()),
        Err(_) => "{}".into(),
    }
}

/// Placeholder `__TOKEN__` is replaced per request; the page is served from the
/// same origin so its fetches need no CORS headers.
const PAGE: &str = r##"<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>DataPulse</title>
<style>
:root{
--bg:oklch(0.187 0.013 74);--card:oklch(0.218 0.014 75);
--fg:oklch(0.912 0.012 85);--dim:oklch(0.68 0.012 80);
--line:oklch(1 0 0 / 9%);--down:oklch(0.720 0.072 205);
--up:oklch(0.752 0.092 60);--ok:oklch(0.742 0.084 158);
--warn:oklch(0.782 0.112 78);--bad:oklch(0.618 0.135 31);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 ui-sans-serif,system-ui,sans-serif;
padding:18px;display:flex;justify-content:center}
main{width:100%;max-width:560px;display:flex;flex-direction:column;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
header{display:flex;align-items:center;gap:8px;font-weight:600;padding:0 2px}
.dot{width:7px;height:7px;border-radius:99px;background:var(--dim)}
.dot.on{background:var(--ok)}
h2{margin:0 0 10px;font-size:12px;font-weight:600;color:var(--dim);
text-transform:uppercase;letter-spacing:.06em}
.rates{display:flex;justify-content:space-between;gap:16px;font-variant-numeric:tabular-nums;font-size:26px}
.rates div{display:flex;align-items:center;gap:8px;min-width:0}
.rx{color:var(--down)}.tx{color:var(--up)}
.spark{display:block;width:100%;height:72px;margin-top:10px}
.spark polyline{fill:none;stroke-width:1.5}
.spark .rx{stroke:var(--down)}
.spark .tx{stroke:var(--up)}
.legend{display:flex;justify-content:space-between;color:var(--dim);font-size:11px;margin-top:6px}
.bar{height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.bar>i{display:block;height:100%;width:0;background:var(--ok);transition:width .4s}
.cols{display:flex;align-items:flex-end;gap:2px;height:80px}
.col{flex:1;display:flex;flex-direction:column-reverse;height:100%}
.col i{display:block;width:100%;flex:none;border-radius:1px}
.axis{display:flex;justify-content:space-between;color:var(--dim);font-size:10px;margin-top:6px}
dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:12px 0 0}
dt{color:var(--dim);font-size:13px}
dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.goal{font-size:26px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:10px 0 0}
.sub{color:var(--dim);font-size:12px;margin:6px 0 0}
</style></head>
<body data-token="__TOKEN__">
<main>
  <header><span class="dot" id="dot"></span>DataPulse · live</header>

  <section class="card">
    <div class="rates">
      <div><span class="rx">↓</span><span id="down">—</span></div>
      <div><span class="tx">↑</span><span id="up">—</span></div>
    </div>
    <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline id="downLine" class="rx" vector-effect="non-scaling-stroke" points=""></polyline>
      <polyline id="upLine" class="tx" vector-effect="non-scaling-stroke" points=""></polyline>
    </svg>
    <div class="legend"><span>last 2 minutes</span><span id="peak">—</span></div>
  </section>

  <section class="card">
    <h2>This period</h2>
    <div class="bar"><i id="bar"></i></div>
    <p class="goal" id="goal">—</p>
    <p class="sub" id="cap">Data cap not set</p>
  </section>

  <section class="card">
    <h2>Today</h2>
    <div class="cols" id="cols"></div>
    <div class="axis" id="axis"></div>
    <dl>
      <dt>Session down</dt><dd id="srx">—</dd>
      <dt>Session up</dt><dd id="stx">—</dd>
      <dt>Wireless</dt><dd id="wifi">—</dd>
      <dt>Today total</dt><dd id="total">—</dd>
    </dl>
  </section>
</main>
<script>
const token = document.body.dataset.token;
const units = ["B","KB","MB","GB","TB"];
function fmt(bytes, rate){
  let value = Number(bytes) || 0, i = 0;
  while (value >= 1024 && i < units.length - 1){ value /= 1024; i++; }
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits) + " " + units[i] + (rate ? "/s" : "");
}
const $ = (id) => document.getElementById(id);

// Rate history lives in the page, so the live chart costs no extra requests.
const WINDOW = 60;
const rx = [], tx = [];
function push(list, value){ list.push(value); if (list.length > WINDOW) list.shift(); }
function line(list, peak){
  const step = 100 / (WINDOW - 1);
  const points = list.length === 1 ? [list[0], list[0]] : list;
  const offset = WINDOW - points.length;
  return points
    .map((value, i) => `${(i + offset) * step},${(30 - Math.min(value / peak, 1) * 28).toFixed(2)}`)
    .join(" ");
}
function drawChart(){
  const peak = Math.max(...rx, ...tx, 1024);
  $("downLine").setAttribute("points", line(rx, peak));
  $("upLine").setAttribute("points", line(tx, peak));
  $("peak").textContent = "peak " + fmt(peak, true);
}

async function pullUsage(){
  let series;
  try {
    const response = await fetch(`/${token}/api/usage`, {cache:"no-store"});
    if (!response.ok) return;
    series = await response.json();
  } catch { return; }

  const buckets = series.buckets || [];
  const max = Math.max(...buckets.map((b) => b.rx + b.tx), 1);
  $("cols").innerHTML = buckets.map((b) => {
    const total = b.rx + b.tx;
    const height = total > 0 ? Math.max((total / max) * 100, 3) : 0;
    const txShare = total > 0 ? (b.tx / total) : 0;
    const down = (height * (1 - txShare)).toFixed(2);
    const up = (height * txShare).toFixed(2);
    return `<div class="col" title="${b.key}">` +
      `<i style="height:${down}%;background:var(--down)"></i>` +
      `<i style="height:${up}%;background:var(--up)"></i></div>`;
  }).join("");

  // Bucket 0 is midnight; label five slots across however much of the day exists.
  const hourLabel = (h) => h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? h + "am" : (h - 12) + "pm";
  const last = buckets.length - 1;
  $("axis").innerHTML = [0, 0.25, 0.5, 0.75, 1]
    .map((share) => Math.round(share * last))
    .filter((hour, i, all) => hour >= 0 && all.indexOf(hour) === i)
    .map((hour) => `<span>${hourLabel(hour)}</span>`)
    .join("");

  $("total").textContent = fmt((series.rx || 0) + (series.tx || 0));
}

async function tick(){
  let data;
  try {
    const response = await fetch(`/${token}/api/snapshot`, {cache:"no-store"});
    if (!response.ok) throw new Error(response.status);
    data = await response.json();
  } catch { $("dot").classList.remove("on"); return; }

  const tick = data.tick, quota = data.quota;
  $("dot").classList.add("on");
  $("down").textContent = fmt(tick.rxRate, true);
  $("up").textContent = fmt(tick.txRate, true);
  $("srx").textContent = fmt(tick.sessionRx);
  $("stx").textContent = fmt(tick.sessionTx);
  $("wifi").textContent = data.wifi
    ? `${data.wifi.ssid || "hidden"} · ${data.wifi.signalPercent}%`
    : "no wireless link";

  push(rx, tick.rxRate);
  push(tx, tick.txRate);
  drawChart();

  if (!quota || !quota.enabled){
    $("bar").style.width = "0";
    $("goal").textContent = "—";
    $("cap").textContent = "Data cap not set";
    return;
  }
  const percent = Math.min((quota.usedBytes / quota.limitBytes) * 100, 100);
  $("bar").style.width = percent + "%";
  $("bar").style.background = percent >= 100 ? "var(--bad)" : percent >= 80 ? "var(--warn)" : "var(--ok)";
  $("cap").textContent = `${fmt(quota.usedBytes)} of ${fmt(quota.limitBytes)}`;
  $("goal").textContent = percent >= 100
    ? "Over the cap"
    : `${percent.toFixed(0)}% · ${fmt(Math.max(quota.limitBytes - quota.usedBytes, 0))} left`;
}
tick();
pullUsage();
setInterval(tick, 2000);
setInterval(pullUsage, 30000);
</script>
</body></html>
"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_carries_the_token_and_no_leftovers() {
        let page = PAGE.replace("__TOKEN__", "abc123");
        assert!(page.contains("abc123"));
        assert!(!page.contains("__TOKEN__"));
    }
}
