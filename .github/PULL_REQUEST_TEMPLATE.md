## What this changes

<!-- One or two sentences. -->

## Why

<!-- The problem, and the root cause if this is a fix. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] UI / design change
- [ ] Refactor (no behavior change)
- [ ] Docs

## Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes
- [ ] Tested by running `npm run tauri dev`
- [ ] Any Rust ↔ TS shape change updated both `models.rs` and `ipc.ts`
- [ ] No raw Tailwind palette colors added (tokens in `src/index.css` only)

## Screenshots

<!-- For UI changes: before and after. Delete this section otherwise. -->
