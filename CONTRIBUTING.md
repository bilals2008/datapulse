# Contributing to DataPulse

Thanks for wanting to help. This is a small, deliberately boring codebase — please
keep it that way.

## Development setup

```bash
git clone https://github.com/bilals2008/datapulse.git
cd datapulse
npm install
npm run tauri dev
```

`npm run tauri dev` starts both halves: the Vite dev server and the Rust backend.
Running `npm run dev` alone gives you the UI, but every IPC call will fail.

Before opening a PR, these must pass:

```bash
npx tsc --noEmit                                   # typecheck
npm run build                                      # tsc + vite production build
cargo check --manifest-path src-tauri/Cargo.toml   # backend compile check
```

CI runs the same three commands on every pull request.

## Code style

### Semantic design tokens only

`src/index.css` is the single source of truth for color. Never use raw Tailwind
palette colors or hex values in components.

```tsx
// ✅ Correct
<Card className="bg-card text-card-foreground">
<span className="text-download">

// ❌ Wrong
<Card className="bg-zinc-900 text-white">
<span className="text-green-500">
```

Need a new color? Add it as a token in `src/index.css` first.

### Rust ↔ TypeScript contract

The frontend talks to the backend only through `api` in `src/lib/ipc.ts`.

- serde serializes as `camelCase`; Tauri command names are `snake_case`.
- Keep the types in `src/lib/ipc.ts` in sync with `src-tauri/src/models.rs`. A
  shape change on one side is a change on both sides, in the same PR.

### Desktop feel

This is a desktop app, not a website: no browser affordances, no text selection
outside opt-in areas, thin scrollbars. The window is frameless, so any new
interaction that touches native chrome (dialogs, shell, updater) needs an explicit
permission in `src-tauri/capabilities/default.json`.

### Keep it small

- Use the existing shadcn/ui components in `src/components/ui/` instead of writing
  custom primitives.
- No comments unless they explain something a reader cannot get from the code.
- Keep files focused; split when a file stops having one job.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-week usage comparison
fix: stop double-counting traffic after sleep
docs: clarify the Windows-only Wi-Fi card
```

## Pull requests

1. Fork the repo and branch off `main` (`git checkout -b fix/collector-drift`).
2. Make the change — including any caller, type, or fixture it touches.
3. Run the three checks above.
4. Fill in the PR template and open the PR against `main`.

Keep one PR to one idea. Bug fixes should say what the root cause was, not just
what was changed.

## Releasing

Do not bump versions by hand. `scripts/bump-version.mjs` keeps
`package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock` in sync, and it is
run by the **Release** workflow, which tags `vX.Y.Z` and uploads a draft release.
Only maintainers cut releases.
