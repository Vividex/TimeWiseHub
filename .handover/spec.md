# Session-scheduled client email

## Goal
Automatically send a business-branded confirmation email to a client when staff schedule a
Programs-in-Sessions session for them — one email per one-off booking, one email per recurring
series (not per generated occurrence).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-09-session-scheduled-client-email-design.md`
- Source plan: `docs/superpowers/plans/2026-07-09-session-scheduled-client-email.md`
- Two new functions in `src/lib/session-email.ts`: `sendSessionScheduledEmail(sessionId)` for
  one-off bookings, `sendSeriesScheduledEmail(seriesId)` for recurring series — both best-effort,
  never throw, gate on paid plan (`isPaidPlan`) and the client having an email on file.
- Reuses the exact branded/reply-to machinery `src/app/api/clients/[id]/messages/route.ts`
  already uses (`invoiceLetterhead`/`invoiceLogo`, `buildReplyToAddress`, `sendEmail`) — no new
  email infrastructure.
- Recurring series get exactly **one** email at series-creation time (describing the day/time +
  cadence pattern), never one per occurrence — `topUpSeries` generates up to 8 occurrences at
  once, so per-occurrence emailing would spam the client.
- One-off booking: browser-side insert in `NewSessionModal.tsx` fires a non-blocking `fetch` to a
  new API route (`POST /api/clients/[id]/sessions/[sessionId]/notify-scheduled`) after the insert
  succeeds. Recurring series: the existing server-side series route calls the helper directly, no
  HTTP hop needed.
- No per-client opt-out toggle this phase (no such flag exists for clients today) — always sends
  if the client has an email and the business is on a paid plan.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown (especially
  `src/components/clients/NewSessionModal.tsx` and
  `src/app/api/clients/[id]/sessions/series/route.ts`, both being surgically modified, not
  rewritten wholesale).
- After each task, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- No DB migration this phase — no Supabase MCP calls needed.
- Manual smoke test (paid-plan email arrival, single-email-per-series, no-email-on-file, free-plan
  gate) requires an authenticated browser session the conductor doesn't have — that final
  acceptance step is the user's own verification, same precedent as every prior phase.
- Commit each verified item separately rather than holding everything for one giant commit.

---

## C-1 — Session-email helper functions

*Codex edits:*
- [x] Export `paragraph` from `src/lib/email-notifications.ts` (plan Task 1, Step 1 — add
  `export` to the existing function on line 48)
- [x] Create `src/lib/session-email.ts` (plan Task 1, Step 2 — exact code is in the plan doc:
  `sendSessionScheduledEmail(sessionId)` and `sendSeriesScheduledEmail(seriesId)`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/lib/email-notifications.ts src/lib/session-email.ts && git commit -m "handover: C-1 session-scheduled email helpers"`

---

## C-2 — Notify-scheduled API route

*Codex edits:*
- [x] Create `src/app/api/clients/[id]/sessions/[sessionId]/notify-scheduled/route.ts` (plan
  Task 2, Step 1 — exact code in the plan doc)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean; confirm the new route appears in the route table.
- [x] Commit: `git add src/app/api/clients/[id]/sessions/[sessionId]/notify-scheduled/route.ts && git commit -m "handover: C-2 notify-scheduled route for one-off session bookings"`

---

## C-3 — Wire the one-off booking modal

*Codex edits:*
- [x] Modify `src/components/clients/NewSessionModal.tsx:176-193` (plan Task 3, Step 1 — add the
  non-blocking `fetch(...).catch(() => {})` call right after the `session_todos` insert block,
  before `router.push`. Exact before/after code is in the plan doc.)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/clients/NewSessionModal.tsx && git commit -m "handover: C-3 email client when a one-off session is booked"`

---

## C-4 — Wire the recurring-series route

*Codex edits:*
- [x] Modify `src/app/api/clients/[id]/sessions/series/route.ts` (plan Task 4, Step 1 — add the
  `sendSeriesScheduledEmail` import and call it right after `topUpSeries(...)`. Exact
  before/after code is in the plan doc.)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/api/clients/[id]/sessions/series/route.ts && git commit -m "handover: C-4 email client once when a recurring session series is booked"`

---

## Acceptance checklist
- [x] C-1: `sendSessionScheduledEmail`/`sendSeriesScheduledEmail` exist, both best-effort/never-throw.
- [x] C-2: `notify-scheduled` route exists, builds clean, enforces access via existing `sessions` RLS.
- [x] C-3: One-off booking flow fires the notification request after insert succeeds.
- [x] C-4: Recurring series route sends exactly one confirmation email per series.
- [x] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (user's own verification — see plan Task 5 checklist) confirms: branded
  email arrives for a paid-plan one-off booking with correct content and working reply-to; a
  recurring series produces exactly one email with correct cadence wording; a client with no
  email doesn't error; a free-plan account doesn't send.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every
turn, full clean build after C-4, plus the manual smoke checklist in
`docs/superpowers/plans/2026-07-09-session-scheduled-client-email.md` (Task 5), which requires
the user's own authenticated browser session.
