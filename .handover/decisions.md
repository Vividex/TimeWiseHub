# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is Rust/Kotlin/CSS/JSON/XML text edits + shell commands on existing toolchain.
  No paid API calls. No new npm packages.
- `pnpm tauri android build` uses local toolchain only — no cloud build service.

## Notes (Phase 24 — Android App)
- Source of exact code: docs/superpowers/plans/2026-06-18-android-app.md
  Each checklist item maps to a Task there; implement the code VERBATIM.
- Codex handles text edits only; conductor runs ALL shell/build/git/adb/keytool commands.
- pnpm is the package manager. Web verification gate = `pnpm run build`.
- Android verification gate = `pnpm tauri android build` producing a valid AAB.
- Steps marked [CONDUCTOR] in spec.md are run by Claude, not Codex — Codex skips them.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.
- Tasks 6 and 7 require user presence (USB device + interactive keytool). Conductor
  will pause at those tasks and ask the user to proceed interactively.
- The generated Android project lives at src-tauri/gen/android/ — these files are
  committed to the repo (created by Task 2) and then modified by Tasks 4 and 8.
- Keystore must be stored OUTSIDE the repo. Never commit it.
