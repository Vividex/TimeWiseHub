# Desktop App: Auto-Hiding Title Bar

## Goal
Replace the Tauri desktop app's native title bar with a custom one that's fully hidden until the
cursor hovers the top edge of the window, freeing up the space it currently crowds (Daily's PiP
button, grid view, etc., discovered while testing the worksheet-annotation feature).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-06-desktop-titlebar-autohide-design.md`
- Source plan: `docs/superpowers/plans/2026-07-06-desktop-titlebar-autohide.md`
- App-wide (`decorations: false` removes the native bar for the whole app, not just video call
  screens), Windows only this pass — no macOS/Linux-specific handling.
- New `TitleBar` component gated via `@tauri-apps/api/core`'s `isTauri()` — renders nothing on the
  regular website or the Android build, only inside the actual Windows desktop app.
- Fully invisible when hidden (no visible sliver) — confirmed trade-off, not an oversight.
- Standard controls only: minimize, maximize/restore, close, drag-to-move, double-click-to-maximize.
- ~400ms hide delay; symmetric enter/leave handling between the invisible trigger strip and the
  bar itself so crossing between them never flickers.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, tauri) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After the task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after the Codex turn — must pass before committing.
- Manual smoke test requires the actual Windows desktop app build (`pnpm tauri:dev` or
  `pnpm tauri:build`) — cannot be verified via a normal browser session, so this is the user's
  own verification step, same as the video-call smoke tests earlier.

---

## C-1 — Custom title bar

*Codex edits:*
- [x] Modify `src-tauri/tauri.conf.json` (plan Task 1, Step 1 — add `"decorations": false`)
- [x] Create `src/components/desktop/TitleBar.tsx` (plan Task 1, Step 2)
- [x] Modify `src/app/layout.tsx` (plan Task 1, Step 3 — mount `<TitleBar />`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. All 3 diffs verified, exact match.
- [ ] Manual smoke test (plan Task 1, Step 5): launch the actual Windows desktop app
  (`pnpm tauri:dev`/`pnpm tauri:build`), confirm no native title bar, bar fully hidden by default,
  reveals on hover, minimize/maximize/restore/close/drag/double-click all work, hides again after
  the cursor leaves. Confirm the regular website is unaffected. **User's own step** — no live
  deploy needed since this only applies to the desktop build.
- [x] Commit: `git add src-tauri/tauri.conf.json src/components/desktop/TitleBar.tsx src/app/layout.tsx && git commit -m "feat: desktop app — auto-hiding custom title bar"`

---

## Acceptance checklist
- [ ] C-1: native title bar replaced, hover-reveal works, all window controls work, confirmed live
  on the Windows desktop build

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean. No test runner in this project —
manual smoke on the actual Windows desktop app build is required, since this can't be verified via
a normal browser session.
