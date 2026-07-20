# FCM / Native Push Full Feature

## Goal
Make push notifications actually work in the Tauri app (Android and desktop) by adding FCM as a
second delivery mechanism alongside the existing, unchanged browser web-push system — validated
plugin choice from the completed spike phase, now becoming a real shipped feature.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-20-fcm-full-feature-design.md`
- Source plan: `docs/superpowers/plans/2026-07-20-fcm-full-feature.md` — 3 tasks, the exact code to
  transcribe for every file is in that plan. This checklist is the tracker; the plan file is the
  source of truth for content.
- All 7 existing notification call sites are untouched — they share one function
  (`sendPushToUser`) which becomes dual-send internally. Confirmed via grep before this phase
  started; do not add per-call-site FCM logic anywhere.
- FCM sending must degrade gracefully if `FIREBASE_SERVICE_ACCOUNT_B64` isn't set yet — existing
  web push must keep working unaffected. This is load-bearing: the code will be live in production
  before the user has necessarily set the Vercel env var, and must not crash.
- Credential handling: base64-encoded (not raw JSON) specifically because the Firebase service
  account JSON contains a multi-line RSA private key prone to newline corruption on re-paste — a
  deliberate choice made during brainstorming, not the simpler default.
- **This phase ends in real manual-only steps neither Codex nor the conductor can perform**: the
  Firebase service account credential setup (user's Google account), and real Android + desktop
  device testing (same rigor as the validation spike — real builds, not dev mode). The loop does
  all 3 code tasks, verifies each builds, commits it, then PAUSES for the user's manual work.
- Desktop's native push behavior (not just standard web push, which already failed in the spike)
  is genuinely unverified — this phase's manual verification explicitly tests it for real rather
  than assuming it works from the plugin's own multi-platform claims.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP, Firebase CLI, vercel
  CLI) — the conductor handles those. Do NOT attempt Task 1 (database migration) — that's
  conductor-only via Supabase MCP, not a Codex turn.
- Transcribe the plan's code exactly — every step's Find/Replace (or full-file Create/Replace)
  block in `docs/superpowers/plans/2026-07-20-fcm-full-feature.md` is complete, real content.
- If any Find block doesn't match a file's actual current content, report it as a blocker with the
  exact text searched for and what the file actually contains nearby — do not guess.

## Rules for conductor (Claude)
- Task 1 (migration) is conductor-only — apply directly via Supabase MCP `apply_migration`, do not
  dispatch to Codex.
- `pnpm run build` after each code turn — must pass before ticking the box and committing.
- After Task 3 (the last code task) is committed, PAUSE with clear, complete instructions for the
  user's manual setup + device testing, and wait for their report before considering the phase
  fully closed.

---

- [x] **F-1** — Database migration: `push_device_tokens` table (plan Task 1, conductor-only via
  Supabase MCP, 1 file).
- [ ] **F-2** — Server-side FCM sending + registration endpoint (plan Task 2, 3 files: `push.ts`
  full rewrite, new `fcm-subscribe` route, `firebase-admin` dependency).
- [ ] **F-3** — Client-side native registration, deep-linking, debug cleanup (plan Task 3, 6
  files: `PushPermission.tsx`/`PushAutoPrompt.tsx` full rewrites, new tap-handler component,
  `dashboard/layout.tsx` wiring, `FcmTokenDebug.tsx` deletion + its `settings/page.tsx` call site
  removed).
  - [ ] Manual (deferred to user): Firebase service account credential → base64 → Vercel env var;
    real Android build + device test; real desktop build + device test (the one genuinely
    unverified path); browser web-push regression check.

## Acceptance checklist
- [ ] `push_device_tokens` table exists with RLS matching `push_subscriptions`' pattern.
- [ ] `sendPushToUser` sends to both web push and FCM tokens, degrades gracefully with no crash if
  the Firebase credential isn't set.
- [ ] `/api/push/fcm-subscribe` POST/DELETE work, scoped to the authenticated user.
- [ ] `PushPermission.tsx`/`PushAutoPrompt.tsx` register through the native plugin on any Tauri
  platform, unchanged web-push behavior in browsers.
- [ ] Tap-to-deep-link wired via `onNotificationClicked` → `router.push(data.data.url)`.
- [ ] `FcmTokenDebug.tsx` and its Settings call site are gone.
- [ ] Full `pnpm run build` passes clean after every code turn.
- [ ] Manual: real Android delivery + deep-link confirmed.
- [ ] Manual: real desktop delivery confirmed (or a real negative finding recorded, same standard
  as the spike).
- [ ] Manual: existing browser web push still works, unaffected.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) for code turns,
plus the manual real-device testing above (the actual deliverable of this phase, same as the
spike it follows).
