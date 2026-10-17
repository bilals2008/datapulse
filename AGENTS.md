# DataPulse

Desktop network & data-usage monitor built with Tauri 2. A Rust backend samples
adapter counters and Wi-Fi state; a React frontend renders live and historical
usage. Windows-first (Wi-Fi details come from `netsh`).

## Commands

- `npm run tauri dev` — full app (Rust + Vite). IPC needs the Rust process.
- `npm run dev` — frontend only; every `invoke` fails.
- `npm run dev:admin` — same as `tauri dev`, elevated. Needed for anything that
  touches ETW or the icon cache.
- `npx tsc --noEmit` — typecheck. There is no lint script.
- `npm run build` — `tsc && vite build`.
- `cargo check --manifest-path src-tauri/Cargo.toml` — backend compile check.
- `npm run tauri icon public/logo.png` — regenerate the icon set from the logo.
- `npm run tauri build` — production bundle (needs the updater signing key).
- `node scripts/bump-version.mjs <patch|minor|major|x.y.z>` — bump `package.json`,
  `tauri.conf.json`, `Cargo.toml` and `Cargo.lock` together.

## Stack

- **Backend:** Tauri 2, Rust edition 2024, `sysinfo` (counters), `rusqlite`
  (`bundled`), `chrono`, `thiserror`.
- **Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS **v4**
  (`@tailwindcss/vite` — no `tailwind.config`).
- **UI:** shadcn/ui (`style: radix-nova`, base `radix`, lucide icons), `recharts`,
  `sonner`. Theming is the local `ThemeProvider` in `src/hooks/use-theme.tsx`.
- **Alias:** `@/*` → `src/*` via `paths` in `tsconfig.json` (no `baseUrl`; it is
  deprecated in TS 6).

## Layout

```
src-tauri/src/
  models.rs       serde types shared with the frontend
  state.rs        AppState + default config
  net.rs          adapter counters via sysinfo
  wifi.rs         SSID / signal / link speed via netsh
  procs.rs        busiest processes (a hint, not per-process traffic)
  db.rs           SQLite: usage_minute, iface_cumulative, settings, anomalies, speed_samples
  collector.rs    sampling thread, emits `pulse-tick`
  analytics/      forecast, anomaly detection, free-window search
  speed.rs        opt-in ISP speed test
  hud.rs          tray icon tint + taskbar progress
  lan.rs          opt-in LAN dashboard server
  commands.rs     every #[tauri::command]
  lib.rs          setup, windows, tray, global shortcut

src/lib/          ipc.ts (typed invoke wrappers + types), format.ts, apps.ts, utils.ts
src/hooks/        use-poll, use-settings, use-live-stats, use-updater, use-theme
src/components/   titlebar, tray-popover, splash, tiny-hud, app-sidebar,
                  quota-card, network-card, usage-chart, live-sparkline,
                  free-window-card, forecast-card, anomaly-feed, activity-heatmap,
                  weekly-recap, speed-card, update-card, info-field, theme-toggle,
                  wrapped-card + wrapped-dialog, ui/* (shadcn)
src/pages/        dashboard, usage, insights, interfaces, settings
src/index.css     single source of truth for design tokens
scripts/          bump-version.mjs, release-notes.mjs
```

## Windows

Four frameless windows (`decorations: false`), all in
`src-tauri/capabilities/default.json`: `main` (1120×720), `splash` (420×264),
`tiny` (208×60, always on top), `popover` (288×322, anchored above the tray icon).

The main window starts hidden behind the splash. The frontend calls
`finish_boot` once settings have loaded; the splash fades out and is destroyed.

## Conventions

- **Semantic tokens only** — `bg-background`, `text-muted-foreground`,
  `border-border`, `text-download`, `bg-success`. Never raw Tailwind palette
  colors (`gray-*`, `blue-*`, `red-*`).
- **Palette:** OKLCH "warm sand + sage + copper". Custom tokens: `--download`,
  `--upload`, `--success`, `--warning`, plus the fixed `--wrapped-*` poster
  palette. Add new colors to `src/index.css`, not inline.
- **Data numerals** use the `text-data` utility (`tabular-nums`).
- **Desktop feel, not web:** custom `titlebar.tsx` (drag region + window
  controls), `user-select: none` globally (opt in with `data-selectable="true"`),
  thin scrollbars, no browser affordances.
- **Branding:** `public/logo.png` is the single logo source — titlebar, favicon
  and `npm run tauri icon`.
- **New window interactions need a capability.** The frameless window has no
  native chrome, so anything Tauri gates (window ops, dialogs, fs) must be added
  to `src-tauri/capabilities/default.json` first.
- **Rust ↔ TS contract:** serde `camelCase`, command names `snake_case`. Keep
  `src/lib/ipc.ts` in sync with `src-tauri/src/models.rs`. The frontend calls the
  backend only through `api` in `src/lib/ipc.ts`.
- No code comments unless they explain something non-obvious. Keep files focused.

## Gotcha: window creation order

Tauri builds the config windows *before* the `setup` hook, so a page can invoke
a command before `app.manage(state)` runs and get `state not managed`. Never
trust that first call — `use-settings` retries for exactly this reason, and
`BootSignal` waits on it before the splash hands over. Do **not** fix it with
`"create": false` and building windows inside `setup`: WebView2 refuses with
`0x8007139F` and the app dies on launch.

## Behaviour

- The collector ticks every `refreshMs` (clamped 500–10000 ms, default 1000),
  persists every 5 s, and emits `pulse-tick` for `LiveStatsProvider`.
- Settings live in the SQLite `settings` table. The DB is `usage.db` in
  `app_data_dir` (WAL mode); startup reconciles counters via `iface_cumulative`.
- Local-day bucketing happens in Rust (chrono `Local` offset); gaps are
  zero-filled.
- Anomalies store a process snapshot taken at detection time (`procs.rs`) — a
  hint about what was busy, not measured per-process traffic.
- Speed tests (`speed.rs`) and the LAN dashboard (`lan.rs`) are opt-in and off by
  default. The speed test pulls ~2 MB per run; the LAN server binds the machine's
  LAN address and only answers on the path that starts with its token.
- Navigation is state-based (`ViewId`), shortcuts `Ctrl/Cmd + 1..5`.
- **Tiny HUD:** live rates plus a level meter per direction and the session total.
  Toggled by `Ctrl+Alt+D` (`tauri-plugin-global-shortcut`, rebindable in
  Settings), the tray item or the Settings switch. After a drag it docks to the
  nearest screen edge; position and shown/hidden live in `settings`, so both
  survive a restart. Double-click opens the main window.
- **Wrapped** is a card on Settings and on Overview only in the last week of the
  year — not a view. It picks a window (day/week/month/year, stepped back with
  the arrows) and opens a dialog that draws the recap on a canvas, saved through
  `save_wrapped_png` into Downloads because the webview cannot write files.
- **Updater notes** come from `scripts/release-notes.mjs`, which lifts the current
  version's `CHANGELOG.md` section into `latest.json` so the in-app "What's new"
  matches the release page.

## Releases & updates

- The updater (`tauri-plugin-updater` + `tauri-plugin-process`) polls
  `plugins.updater.endpoints` in `tauri.conf.json` (GitHub
  `releases/latest/download/latest.json`) and verifies bundles against the public
  key there. `bundle.createUpdaterArtifacts` must stay `true`.
- Generate the signing key once:
  `npm run tauri signer generate -w ~/.tauri/datapulse.key`. Keep the private key
  in the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the public key stays in `tauri.conf.json`.
- Releases are manual: **Actions → Release → Run workflow**, pick
  `patch`/`minor`/`major` (or `explicit` for an exact version). It bumps the
  version, tags `vX.Y.Z`, builds every platform and uploads a **draft** release.
  Publish the draft to ship the update. Pushing to `main` runs `ci.yml` only.
- The owner `bilals2008` appears in `plugins.updater.endpoints`
  (`tauri.conf.json`) and `RELEASES_URL` (`update-card.tsx`). Both must point at
  the same repo or update checks will not resolve.
- `ci.yml` runs `tsc --noEmit` + `vite build` + `cargo check` on PRs and `main`.