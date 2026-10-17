# DataPulse — AGENTS.md

Desktop network & data-usage monitor built with Tauri 2. A Rust backend samples
adapter counters and Wi-Fi state; a React frontend renders live and historical
usage. Windows-first (Wi-Fi details come from `netsh`).

## Commands

- `npm run tauri dev` — run the full app (Rust + Vite). Requires the backend for IPC.
- `npm run dev` — frontend only; IPC calls will fail without the Rust process.
- `npx tsc --noEmit` — typecheck. There is no lint script.
- `npm run build` — `tsc && vite build`.
- `cargo check --manifest-path src-tauri/Cargo.toml` — backend compile check.
- `npm run tauri icon public/logo.png` — regenerate the app icon set from the logo.
- `npm run tauri build` — production desktop bundle (needs the updater signing key).
- `node scripts/bump-version.mjs <patch|minor|major|x.y.z>` — bump the version in
  `package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock` together.

## Stack

- **Backend:** Tauri 2, Rust edition 2024, `sysinfo` (counters), `rusqlite`
  (`bundled`), `chrono`, `thiserror`.
- **Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS **v4**
  (`@tailwindcss/vite` — no `tailwind.config`).
- **UI:** shadcn/ui (`style: radix-nova`, base `radix`, lucide icons), `recharts`,
  `next-themes`, `sonner`.
- **Alias:** `@/*` → `src/*` via `paths` in `tsconfig.json` (no `baseUrl`; it is
  deprecated in TS 6).

## Layout

```
src-tauri/src/   models, error, state, net (counters), wifi (netsh), procs (busiest processes + pid→app),
                 db (SQLite), collector (thread + `pulse-tick`), analytics (forecast, anomaly,
                 quiet window), speed (ISP speed test), hud (tray tint + taskbar progress),
                 lan (LAN dashboard server), etw (per-app traffic), conns (socket owner table),
                 icons (exe icon → data URI), commands (IPC), lib
src/lib/         ipc.ts (typed invoke wrappers + shared types), format.ts
src/hooks/       use-poll, use-settings (SettingsProvider), use-live-stats (LiveStatsProvider),
                 use-updater (UpdaterProvider + auto-check on startup)
src/components/  app-sidebar, quota-card, network-card, usage-chart, live-sparkline,
                 free-window-card, speed-card, update-card, info-field, theme-toggle,
                 tiny-hud, wrapped-card + wrapped-dialog, ui/* (shadcn)
src/pages/       dashboard, usage, apps, insights, interfaces, settings
src/index.css    single source of truth for design tokens
scripts/         bump-version.mjs (keeps every version field in sync)
```

## Conventions

- **Semantic tokens only** — `bg-background`, `text-muted-foreground`,
  `border-border`, `text-download`, `bg-success`. Never raw Tailwind palette
  colors (`gray-*`, `blue-*`, `red-*`).
- **Palette:** OKLCH "warm sand + sage + copper". Custom tokens: `--download`,
  `--upload`, `--success`, `--warning`. Add new colors to `src/index.css`, not inline.
- **Data numerals** use the `text-data` utility (`tabular-nums`).
- **Desktop feel, not web:** frameless window (`decorations: false`) with the
  custom `src/components/titlebar.tsx` (drag region + window controls),
  `user-select: none` globally (opt in with `data-selectable="true"`), thin
  scrollbars, no browser affordances.
- **Branding:** `public/logo.png` is the single logo source — used by the
  titlebar, the favicon, and `npm run tauri icon` for the app icon set.
- **Toasts:** the frameless window has no native chrome, so new window
  interactions need an explicit capability in `src-tauri/capabilities/default.json`.
- **Rust ↔ TS contract:** serde `camelCase`; command names are `snake_case`. Keep
  `src/lib/ipc.ts` types in sync with `src-tauri/src/models.rs`. The frontend calls
  the backend only through `api` in `src/lib/ipc.ts`.
- Tauri builds the config windows *before* the `setup` hook, so a page can
  invoke a command before `app.manage(state)` runs and be answered with `state
  not managed`. That call must not be trusted to be the only one — `use-settings`
  retries its fetch for exactly this reason, and `BootSignal` waits on it before
  the splash hands over. Do not try to fix it by setting `"create": false` and
  building the windows inside `setup`: WebView2 refuses with `0x8007139F` and the
  app dies on launch.
- No code comments unless they explain something non-obvious. Keep files focused.

## Behaviour

- Collector ticks every `refreshMs` (clamped 500–10000 ms; default 1000), persists
  every 5 s, and emits `pulse-tick` events consumed by `LiveStatsProvider`.
- Settings live in the SQLite `settings` table; the DB is `usage.db` in
  `app_data_dir` (WAL mode). Startup reconciles counters via `iface_cumulative`.
- Local-day bucketing is done in Rust (chrono `Local` offset); gaps are zero-filled.
- Anomalies store a process snapshot taken at detection time (`procs.rs`). It is a
  hint about what was busy, not measured per-process traffic.
- The hourly speed test (`speed.rs`) is opt-in and pulls ~2 MB per run. The LAN
  dashboard (`lan.rs`) is opt-in, binds the machine's LAN address, and needs the
  token in the URL path. Both are off by default.
- Navigation is state-based (`ViewId`), keyboard shortcuts `Ctrl/Cmd + 1..6`.
- **Applications** is a view (`src/pages/apps.tsx`): the ranked per-program
  traffic and, for the selected row, its hourly chart. Windows only hands out
  per-process traffic through Event Tracing for Windows, so `etw.rs` runs a
  real-time `Microsoft-Windows-TCPIP` session and needs an elevated process;
  unelevated it silently records nothing and the page says so. Two details
  worth not rediscovering: `StartTraceW` needs a properties buffer that holds
  room past the struct for the session name (otherwise ERROR_BAD_LENGTH), and
  the session GUID has to be fresh on every launch (otherwise
  ERROR_ALREADY_EXISTS). Send events name the owner in the event header;
  receive events come from `System`, so `conns.rs` snapshots
  `GetExtendedTcpTable`/`GetExtendedUdpTable` to map the local endpoint back to
  a process. `icons.rs` reads the icon out of the executable's PE resources, so
  no logo service is involved.
- The tiny HUD is a second window (`label: "tiny"`, 208×60, always on top) built
  by `src/components/tiny-hud.tsx`: live rates with a level meter per direction,
  and the session total. `Ctrl+Alt+D` (`tauri-plugin-global-shortcut`),
  the tray item, the Settings switch or its hide button toggles it, and the chord
  is rebindable.
  After a drag it docks to the nearest screen edge; the spot and the shown/hidden
  choice live in the `settings` table, so both survive a restart. Double-clicking
  opens the main window.
- Wrapped is a card on Settings, and on Overview only in the last week of the
  year, not a view: the card picks the window (day/week/month/year, stepped back
  with the arrows) and opens a dialog that draws the recap on a canvas from the
  fixed `--wrapped-*` poster palette in `src/index.css` and saves it through
  `save_wrapped_png` (Downloads folder); the webview cannot save files itself.

## Releases & updates

- The app ships with the Tauri updater (`tauri-plugin-updater` + `tauri-plugin-process`).
  It polls `plugins.updater.endpoints` in `tauri.conf.json` (GitHub
  `releases/latest/download/latest.json`) and verifies bundles against the public
  key there. `bundle.createUpdaterArtifacts` must stay `true` for this to work.
- Generate the signing key once: `npm run tauri signer generate -w ~/.tauri/datapulse.key`.
  Put the private key in the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; keep the public key in `tauri.conf.json`.
- Releases are manual: run **Actions → Release → Run workflow** and pick the
  bump (`patch`/`minor`/`major`, or `explicit` for an exact version). The
  workflow bumps the version, tags `vX.Y.Z`, builds all platforms and uploads a
  **draft** GitHub release. Publish the draft to ship the update. Pushing to
  `main` runs `ci.yml` only — it does not release.
- The GitHub owner `bilals2008` is set in `plugins.updater.endpoints`
  (`tauri.conf.json`) and `RELEASES_URL` (`update-card.tsx`). Both must point at
  the same repo or update checks will not resolve.
- `ci.yml` runs typecheck + `vite build` + `cargo check` on PRs and `main`.
