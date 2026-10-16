<div align="center">

<img src="public/logo.png" alt="DataPulse" width="96" />

# DataPulse

**A local-first desktop monitor for network speed and data usage.**

DataPulse samples your network adapters in the background, shows live download/upload speeds, records usage history in a local database, and tracks it against a monthly data cap — offline, with no accounts and no telemetry.

[![Release](https://img.shields.io/github/v/release/bilals2008/datapulse?style=flat-square&logo=github)](https://github.com/bilals2008/datapulse/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-backend-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](#requirements)

</div>

---

## Overview

Windows, macOS and Linux all show you a total, but not when it happened or which
adapter it came from. DataPulse fills that gap: a background collector thread
reads adapter counters every second, stores the deltas locally, and renders them
as live rates, hourly/day/month charts, and per-interface totals.

- **Live throughput** — real-time download/upload rate, rolling sparkline and session totals, refreshed every second.
- **Usage history** — hourly view for today, plus 7-day, 30-day and 12-month aggregate charts split by direction.
- **Insights** — a weekly recap, an anomaly feed of unusual transfer days, and a projected month-end forecast.
- **Per-interface breakdown** — every adapter, its live rate, and what it transferred today, with an idle filter.
- **Data cap tracking** — a monthly allowance and billing-cycle reset day, with percentage used, remaining, projected month-end usage, and warnings at 80% and 100%.
- **Wi-Fi details** — SSID, signal strength, radio type, channel and negotiated link rates.
- **Native desktop feel** — frameless window with a custom titlebar, light/dark/system theme, keyboard shortcuts.
- **Local-first** — every sample lives in a local SQLite file. Nothing is sent anywhere.

---

## Screens

| View | What it shows |
| --- | --- |
| **Overview** | Live speeds, today's hourly chart, data-cap progress, Wi-Fi card, session totals |
| **Usage** | Range switch (today / 7 days / 30 days / 12 months), transfer chart, per-interface table |
| **Insights** | Weekly recap, anomaly feed, projected month-end forecast |
| **Interfaces** | Live rates and today's totals for each adapter, with an idle filter |
| **Settings** | Theme, sample interval, data cap, startup, updates, clear history, database path |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Shell | [Tauri 2](https://tauri.app/) |
| Backend | [Rust](https://www.rust-lang.org/) (edition 2024), [`sysinfo`](https://crates.io/crates/sysinfo), [`rusqlite`](https://crates.io/crates/rusqlite) (bundled SQLite), [`chrono`](https://crates.io/crates/chrono), [`thiserror`](https://crates.io/crates/thiserror) |
| Frontend | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/) |
| UI | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/), [Recharts](https://recharts.org/), [lucide](https://lucide.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| Updates | [`tauri-plugin-updater`](https://crates.io/crates/tauri-plugin-updater) + [`tauri-plugin-process`](https://crates.io/crates/tauri-plugin-process) |

---

## Getting Started

### Requirements

| Tool | Notes |
| --- | --- |
| [Node.js](https://nodejs.org/) | 20.19 or later (22.12+ recommended; CI uses 24) |
| [Rust](https://rustup.rs/) | Stable toolchain |
| **Windows** | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select *Desktop development with C++*) and WebView2 (preinstalled on Windows 10/11) |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** | WebKitGTK and build deps, see the [Tauri prerequisites](https://tauri.app/start/prerequisites/) |

> Wi-Fi details are read from `netsh wlan show interfaces`, so that card is Windows-only. Everything else is cross-platform.

### Install and run

```bash
git clone https://github.com/bilals2008/datapulse.git
cd datapulse
npm install
npm run tauri dev
```

> ⏳ The first run compiles the Rust backend and can take a few minutes. After that it starts fast.

Frontend only (IPC calls fail without the Rust process):

```bash
npm run dev
```

---

## Build

```bash
npm run tauri build
```

The installer and binary land in `src-tauri/target/release/bundle/`.

App icons (Windows `.ico`, macOS `.icns`, PNGs) are generated from the single logo
source at `public/logo.png`:

```bash
npm run tauri icon public/logo.png
```

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run tauri dev` | Run the full desktop app (Rust + Vite) |
| `npm run dev` | Frontend dev server only |
| `npm run build` | Typecheck + production frontend build |
| `npm run tauri build` | Production desktop bundle |
| `npx tsc --noEmit` | Typecheck (no lint script configured) |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Backend compile check |
| `node scripts/bump-version.mjs <patch\|minor\|major\|x.y.z>` | Bump every version field together |

---

## How It Works

A background **collector thread** in the Rust backend polls adapter counters every
`refreshMs` (default `1000`, clamped `500`–`10000`). Each tick:

1. Computes the delta per interface → download/upload rate.
2. Emits a `pulse-tick` event, consumed by `LiveStatsProvider` for the UI.
3. Persists accumulated traffic into SQLite every 5 seconds.

On startup, counters are reconciled against the last stored cumulative values so
traffic recorded while the app was closed isn't lost or double-counted. Wi-Fi
state is polled separately every 15 seconds via `netsh`.

Usage is bucketed into **local** days and hours (chrono `Local` offset applied in
the SQLite query), and missing buckets are zero-filled so charts stay continuous.

### Data & Storage

Everything lives in a single local database:

```
%APPDATA%\com.muham.datapulse\usage.db        # Windows
~/Library/Application Support/com.muham.datapulse/usage.db   # macOS
~/.local/share/com.muham.datapulse/usage.db   # Linux
```

| Table | Purpose |
| --- | --- |
| `usage_minute` | Traffic samples per interface per minute (`ts_min`, `iface`, `rx`, `tx`) |
| `iface_cumulative` | Last known counter totals per interface (for reconciliation) |
| `settings` | Key/value preferences (`refreshMs`, `quotaGb`, `resetDay`) |
| `anomalies` | Detected anomalies (`kind`, `severity`, `dismissed`) behind the Insights feed |

WAL mode is enabled. Delete all recorded history anytime from **Settings → Storage → Clear history**.

### Privacy

DataPulse observes only **traffic volume per adapter**. It does not inspect packet
contents, hostnames or destinations, and it makes no network requests of its own.

---

## Configuration

| Setting | Default | Notes |
| --- | --- | --- |
| Refresh interval | 1 s | 0.5 s – 5 s |
| Data cap | Disabled | Monthly allowance in GB + reset day (1–28) |
| Theme | System | Light / Dark / System |
| Open on startup | Off | Launch DataPulse when you sign in |
| Updates | Auto-check on startup | Manual check in Settings → Updates |

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + 1` | Overview |
| `Ctrl/Cmd + 2` | Usage |
| `Ctrl/Cmd + 3` | Insights |
| `Ctrl/Cmd + 4` | Interfaces |
| `Ctrl/Cmd + 5` | Settings |

---

## Project Structure

```
datapulse/
├── src-tauri/src/          # Rust backend
│   ├── models.rs           # Shared serde types (camelCase)
│   ├── net.rs              # Adapter counter sampling
│   ├── wifi.rs             # `netsh` wrapper (Windows)
│   ├── db.rs               # SQLite schema + queries
│   ├── collector.rs        # Sampling thread + `pulse-tick` event
│   ├── commands.rs         # IPC commands
│   └── state.rs, error.rs  # App state and error type
├── src/                    # React frontend
│   ├── lib/                # Typed invoke wrappers (ipc.ts), formatters
│   ├── hooks/              # Polling, live stats, settings, updater, theme
│   ├── components/         # Sidebar, cards, charts, titlebar, ui/ (shadcn)
│   ├── pages/              # dashboard, usage, insights, interfaces, settings
│   └── index.css           # Design tokens (single source of truth)
├── scripts/                # bump-version.mjs
└── public/logo.png         # Single logo source (titlebar, favicon, app icons)
```

---

## Releases

Releases are cut from GitHub Actions: run **Actions → Release → Run workflow** and
pick the bump. The workflow bumps the version, tags `vX.Y.Z`, builds all platforms
and uploads a draft GitHub release — publish it to ship the update.

Already running DataPulse? Open **Settings → Updates** and check for updates, or let
it check on startup and install itself. See [CHANGELOG.md](./CHANGELOG.md) for
what changed in each version.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev
setup, code style, and the checks your PR must pass. This project follows the
[Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please use [Conventional Commits](https://www.conventionalcommits.org/) format.

---

## Author

**Muhammad Bilal Hassan**

[![GitHub](https://img.shields.io/badge/GitHub-bilals2008-181717?style=flat-square&logo=github)](https://github.com/bilals2008)
[![Website](https://img.shields.io/badge/Website-mbilalhassan.vercel.app-00b849?style=flat-square&logo=vercel&logoColor=white)](https://mbilalhassan.vercel.app/)

---

## License

Released under the [MIT License](./LICENSE).

<div align="center">

**Built with care by [Muhammad Bilal Hassan](https://github.com/bilals2008)**

</div>
