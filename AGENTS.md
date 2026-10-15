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
- `npm run tauri build` — production desktop bundle.

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
src-tauri/src/   models, error, state, net (counters), wifi (netsh),
                 db (SQLite), collector (thread + `pulse-tick`), commands (IPC), lib
src/lib/         ipc.ts (typed invoke wrappers + shared types), format.ts
src/hooks/       use-poll, use-settings (SettingsProvider), use-live-stats (LiveStatsProvider)
src/components/  app-sidebar, quota-card, network-card, usage-chart, live-sparkline,
                 info-field, theme-toggle, ui/* (shadcn)
src/pages/       dashboard, usage, interfaces, settings
src/index.css    single source of truth for design tokens
```

## Conventions

- **Semantic tokens only** — `bg-background`, `text-muted-foreground`,
  `border-border`, `text-download`, `bg-success`. Never raw Tailwind palette
  colors (`gray-*`, `blue-*`, `red-*`).
- **Palette:** OKLCH "warm sand + sage + copper". Custom tokens: `--download`,
  `--upload`, `--success`, `--warning`. Add new colors to `src/index.css`, not inline.
- **Data numerals** use the `text-data` utility (`tabular-nums`).
- **Desktop feel, not web:** `user-select: none` globally (opt in with
  `data-selectable="true"`), thin scrollbars, native titlebar, no browser affordances.
- **Rust ↔ TS contract:** serde `camelCase`; command names are `snake_case`. Keep
  `src/lib/ipc.ts` types in sync with `src-tauri/src/models.rs`. The frontend calls
  the backend only through `api` in `src/lib/ipc.ts`.
- No code comments unless they explain something non-obvious. Keep files focused.

## Behaviour

- Collector ticks every `refreshMs` (clamped 500–10000 ms; default 1000), persists
  every 5 s, and emits `pulse-tick` events consumed by `LiveStatsProvider`.
- Settings live in the SQLite `settings` table; the DB is `usage.db` in
  `app_data_dir` (WAL mode). Startup reconciles counters via `iface_cumulative`.
- Local-day bucketing is done in Rust (chrono `Local` offset); gaps are zero-filled.
- Navigation is state-based (`ViewId`), keyboard shortcuts `Ctrl/Cmd + 1..4`.
