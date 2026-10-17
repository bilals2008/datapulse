# Changelog

All notable changes to DataPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.3.1] - October 17, 2026

### Added

#### Anomaly Feed

- The busiest processes are grouped per app: helpers collapse into one line with their CPU added up, and each app shows its brand mark, falling back to a letter badge when there is no logo

#### Settings

- About lists the author with links to the website and GitHub

### Removed

#### Applications

- The Applications view is gone. Windows only reports per-application traffic through Event Tracing for Windows, which needs an elevated session and does not hand out usable numbers on Windows 10 anyway, so the page could only ever be empty. The ETW trace session, the socket-owner table and the icon reader went with it — none of this ever reached a release

### Fixed

#### Settings

- Minimise to tray, hourly speed test, LAN dashboard and automatic update checks were stuck greyed out with a not-allowed cursor in the installed app: the settings request could be answered before the backend finished starting, and the one attempt it got was thrown away
- The settings request now retries until it is answered, so the window also stops waiting out the splash delay on launch
- Saving the data cap no longer writes default values over preferences stored on the device

---

## [0.2.0] - October 16, 2026

### Added

#### Data Cost

- Price per GB and currency settings turn usage into spend, shown on the quota card and the dashboard
- Cost figures stay hidden while the price is left at 0

#### Anomaly Details

- Anomalies now record the busiest processes at detection time
- The anomaly feed lists the top three of them with their CPU share

#### Quiet Hours

- Insights card finds the least busy four-hour stretch of the day, averaged over two weeks
- Advice line measures a four-hour run in that window against the allowance left

#### Line Speed

- Opt-in hourly speed test pulls about 2 MB and records throughput and first-byte latency
- Speed card plots throughput by hour of day, calls out the fastest and slowest hours, and runs a test on demand

#### LAN Dashboard

- Read-only live page for phones on the same network, showing live rates, the allowance bar and today's hourly usage
- Off by default; listens on port 7676 while enabled and requires a token in the URL

#### Desktop Integration

- Tray icon is tinted by cap pressure, with a tooltip showing the cap percentage and session total
- Taskbar progress bar mirrors the allowance

#### Wrapped

- A Wrapped card on Settings, and on Overview once the year's last week starts, opens a dialog: a year recap of total moved, busiest day, peak hour, top link and active days
- The recap renders to a 1080×1350 poster on a canvas and saves as a PNG into the Downloads folder
- Year picker steps back through history; the poster keeps its own dark palette whatever theme the app is in

### Changed

#### Storage

- Anomalies gained a process snapshot column and speed samples their own table, both as additive migrations
- Quiet-window, cost and speed-test calculations moved into the Rust analytics module, covered by unit tests

---

## [0.1.3] - October 16, 2026

### Added

#### Startup

- Launch on startup from a new Startup card in Settings, so monitoring starts without opening the app

### Changed

#### Release Pipeline

- Releases are now cut on purpose from GitHub Actions instead of firing on every push to `main`
