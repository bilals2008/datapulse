# DataPulse

A desktop **network & data-usage monitor**. DataPulse samples your network
adapters in the background, shows live download/upload speeds, records usage
history locally, and tracks it against a monthly data cap — all offline, with no
accounts and no telemetry.

Built with **Tauri 2** (Rust backend) and **React + TypeScript** (frontend).

---

## Features

- **Live throughput** — real-time download/upload rate, a rolling sparkline, and
  session totals, updated every second.
- **Usage history** — hourly view for today, plus 7-day, 30-day and 12-month
  aggregate charts (download/upload split).
- **Per-interface breakdown** — see every adapter, its live rate, and how much it
  transferred today. Hide idle adapters with one toggle.
- **Data cap tracking** — set a monthly allowance and a billing-cycle reset day;
  DataPulse shows percentage used, remaining, projected month-end usage, and warns
  you at 80% and 100%.
- **Wi-Fi details** — SSID, signal strength, radio type, channel, and negotiated
  link rates.
- **Native desktop feel** — light/dark/system theme, warm low-contrast palette,
  custom scrollbars, keyboard shortcuts (`Ctrl/Cmd + 1..4`).
- **Local-first** — every sample is stored in a local SQLite database. Nothing is
  ever sent anywhere.

## Screens

| View | What it shows |
| --- | --- |
| **Overview** | Live speeds, today's hourly chart, data-cap progress, Wi-Fi card, session totals |
| **Usage** | Range switch (today / 7 days / 30 days / 12 months), transfer chart, per-interface table |
| **Interfaces** | Live rates and today's totals for each adapter, with an idle filter |
| **Settings** | Theme, sample interval, data cap, clear history, local database path |

## Tech stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 |
| Backend | Rust (edition 2024), `sysinfo`, `rusqlite` (bundled SQLite), `chrono`, `thiserror` |
| Frontend | React 19, TypeScript 6, Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| UI | shadcn/ui (radix-nova), `recharts`, `lucide-react`, `sonner` |

## Requirements

- **Windows 10/11** (Wi-Fi details are read from `netsh`; the rest is
  cross-platform)
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable)
- C++ build tools + WebView2 (install via Visual Studio Build Tools; WebView2 ships
  with modern Windows)

## Getting started

```bash
npm install
npm run tauri dev      # build + launch the desktop app
```

Frontend-only (IPC calls will fail without the Rust process):

```bash
npm run dev
```

## Build a release

```bash
npm run tauri build    # installer/bundle in src-tauri/target/release
```

## Checks

```bash
npx tsc --noEmit       # typecheck (no lint script configured)
npm run build          # tsc + vite production build
cargo check --manifest-path src-tauri/Cargo.toml
```

## How it works

A background **collector thread** in the Rust backend polls adapter counters every
`refreshMs` (default `1000`, clamped `500`–`10000`). Each tick:

1. Computes the delta per interface → download/upload rate.
2. Emits a `pulse-tick` event (consumed by `LiveStatsProvider` for the UI).
3. Persists accumulated traffic into SQLite every 5 seconds.

On startup, counters are reconciled against the last stored cumulative values so
traffic recorded while the app was closed isn't lost or double-counted. Wi-Fi
state is polled separately every 15 seconds via `netsh wlan show interfaces`.

Usage is bucketed into **local** days/hours (chrono `Local` offset applied in the
SQLite query), and missing buckets are zero-filled so charts stay continuous.

### Data & storage

Everything lives in a single local database:

```
%APPDATA%\com.muham.datapulse\usage.db
```

| Table | Purpose |
| --- | --- |
| `usage_minute` | Traffic samples per interface per minute (`ts_min`, `iface`, `rx`, `tx`) |
| `iface_cumulative` | Last known counter totals per interface (for reconciliation) |
| `settings` | Key/value preferences (`refreshMs`, `quotaGb`, `resetDay`) |

WAL mode is enabled. You can delete all recorded history anytime from
**Settings → Storage → Clear history**.

### Privacy

DataPulse observes only **traffic volume per adapter**. It does not inspect
packet contents, hostnames, or destinations, and it makes no network requests of
its own.

## Project structure

```
src-tauri/src/      Rust backend
  net.rs            adapter counter sampling
  wifi.rs           `netsh` wrapper (Windows)
  db.rs             SQLite schema + queries
  collector.rs      sampling thread + `pulse-tick` event
  commands.rs       IPC commands exposed to the frontend
src/
  lib/ipc.ts        typed `invoke` wrappers + shared types
  lib/format.ts     byte/rate/label formatters
  hooks/            polling, live stats, settings, theme providers
  components/       UI blocks (sidebar, cards, charts) + ui/ (shadcn)
  pages/            dashboard, usage, interfaces, settings
  index.css         design tokens (single source of truth)
```

## Configuration

| Setting | Default | Notes |
| --- | --- | --- |
| Refresh interval | 1 s | 0.5 s – 5 s from Settings |
| Data cap | disabled | Monthly allowance in GB + reset day (1–28) |
| Theme | System | Light / Dark / System |

## Author

Built by [**Muhammad Bilal Hassan**](https://github.com/bilals2008)

## License

Released under the MIT License.
