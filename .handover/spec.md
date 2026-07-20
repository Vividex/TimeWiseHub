# FCM / Native Push Validation Spike

## Goal
Answer, on real devices, whether desktop Tauri already supports standard web push and whether the
leading Android native-push plugin (`tauri-plugin-notifications`, Choochmeque) can deliver a
notification to a fully-closed app and give the app enough information on tap to eventually
deep-link — before designing the full FCM feature. Produces scaffolding + a recorded observation,
not a shipped feature.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-20-fcm-push-spike-design.md`
- Source plan: `docs/superpowers/plans/2026-07-20-fcm-push-spike.md` — 2 tasks, the exact code to
  transcribe for every file is in that plan. This checklist is the tracker; the plan file is the
  source of truth for content.
- **Both tasks have a real manual-only step neither Codex nor the conductor can perform**: a real
  desktop build + manual test (P-1), and Firebase Console project creation + a real Android build
  + on-device test (P-2). The loop does the code scaffolding for each task, verifies it builds,
  commits it, then PAUSES cleanly for the user to do that task's manual step and report back what
  they observed — this is an expected, planned pause, not an error blocker.
- **Commit message convention override**: the plan's own Step 9 templates include a
  "<fill in what was actually observed>" placeholder. Per this project's established pattern (every
  prior phase), don't bake unconfirmed results into a commit message — commit the code with a
  clean, factual message ("scaffolding only, pending manual device validation"), then record the
  real observed result in `decisions.md`'s phase-complete Notes section once the user reports back,
  same as every other phase's manual-smoke-test write-up in this project.
- No database migration. No production notification call sites touched. The debug token UI
  (`FcmTokenDebug.tsx`) is temporary scaffolding, not a shipped feature.
- Do NOT commit `src-tauri/gen/android/app/google-services.json` — add it to `.gitignore` in the
  same commit that adds the Gradle changes referencing it (plan Task 2 Step 9 has the exact line).

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP, Firebase CLI) — the
  conductor handles those. Do NOT attempt the manual Firebase Console / real-device steps — those
  are explicitly the user's to do, not yours or the conductor's.
- Transcribe the plan's code exactly — every step's Find/Replace (or full-file Create) block in
  `docs/superpowers/plans/2026-07-20-fcm-push-spike.md` is complete, real content, verified against
  the actual plugin's current docs during plan-writing.
- If any Find block doesn't match a file's actual current content, report it as a blocker with the
  exact text searched for and what the file actually contains nearby — do not guess.
- Plan Task 2 Step 5 (Gradle file edits under `src-tauri/gen/android/`) are plain text edits to
  already-existing generated files (confirmed present before this phase started) — transcribe them
  the same as any other file, no special handling needed.

## Rules for conductor (Claude)
- `pnpm run build` after each code turn — must pass before ticking the box and committing. This
  verifies the JS/TS side only; the Rust/Android side can only be verified by the user's real build.
- No migration this phase — no conductor-only SQL item.
- After each task's code is committed, PAUSE (not a normal `continue`) with clear, complete
  instructions for that task's manual step, and wait for the user's report before resuming.

---

- [x] **P-1** — Desktop webview push test: code (plan Task 1, Steps 1-7, 6 files) + PAUSE for the
  user's real desktop build + manual test (Step 8) + finalize with the real result (Step 9,
  commit message adjusted per the override above; record the actual finding in decisions.md).
  **Result: negative.** Confirmed via real device console (`pnpm tauri:dev` + devtools):
  `typeof Notification === 'undefined'` and `typeof navigator.serviceWorker === 'undefined'` in
  the Tauri WebView2 environment. Desktop cannot use standard web push at all — it needs the same
  native-plugin treatment as Android, not a two-line gate fix. Code from Steps 1-6 is kept as-is
  (correctly narrows the unsupported gate to android/ios; harmless and more accurate either way).
- [ ] **P-2** — Android FCM scaffold + device validation: code (plan Task 2, Steps 2-4 + 6-7, 5
  files/1 new file) + PAUSE for the user's Firebase project creation (Step 1), Gradle file
  presence is already confirmed so Step 5's edits can be done in the same code turn as the rest,
  and the user's real Android build + on-device test (Step 8) + finalize with the real result
  (Step 9, same commit-message override; record the actual finding in decisions.md).

## Acceptance checklist
- [ ] Desktop: `@tauri-apps/plugin-os` wired in, gate narrowed to android/ios only, code builds
  clean.
- [x] Desktop: real-device result recorded (does WebView2 support push while minimized, yes/no) —
  **no**: `Notification`/`navigator.serviceWorker` are both undefined in the Tauri WebView2
  environment.
- [ ] Android: `tauri-plugin-notification` (singular, unused) fully swapped for
  `tauri-plugin-notifications` (plural, FCM-capable) in Cargo.toml, lib.rs, and
  capabilities/android.json.
- [ ] Android: temporary debug token + event-log UI added to Settings, code builds clean.
- [ ] Android: real-device result recorded for all three app states (foreground/background/fully
  closed) and the cold-start tap/payload-access question.
- [ ] `google-services.json` never committed; `.gitignore` updated instead.
- [ ] Full `pnpm run build` passes clean after every code turn.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) for code turns.
The actual deliverable of this phase (device-test results) can only be verified by the user on
real hardware — that's the whole point of the spike, not a gap to work around.
