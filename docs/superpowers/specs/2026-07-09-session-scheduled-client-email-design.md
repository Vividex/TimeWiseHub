# Session-scheduled client email — design

## Purpose

When staff book a tutoring session for a client in the Programs-in-Sessions flow, the client
currently finds out only by checking the app (or being told separately). This adds an automatic,
business-branded confirmation email so the client knows a session is scheduled without staff
having to message them manually.

## Scope

- **Trigger**: Programs-in-Sessions session creation only (roster shifts are explicitly
  out of scope).
- **Who can trigger it**: staff only — clients don't self-serve booking today, so no
  client-facing trigger path is needed.
- **Both creation paths**:
  - One-off session booked via `NewSessionModal.tsx` (browser-side insert into `sessions`).
  - Recurring series booked via `POST /api/clients/[id]/sessions/series` — sends **one** email
    describing the recurring pattern when the series is created, not one email per generated
    occurrence. (`topUpSeries` generates up to 8 occurrences at once on series creation, and the
    cron `process-recurring-sessions` tops up more later — emailing per-occurrence would mean 8
    emails at once, then more over time. A single "your recurring session is confirmed" email
    matches what a person actually wants.)
- **Not in scope**: a per-client opt-out toggle (no such flag exists for clients today — only
  staff have `notification_preferences`; adding one is a separate follow-up if it's ever needed),
  cancellation/reschedule emails, and any email for individually-generated future series
  occurrences.

## Gating

- Same paid-plan gate as the existing Client Email Messaging feature
  (`getSubscription` + `isPaidPlan`): free-plan businesses don't get this email, consistent with
  branded client-facing email being a Pro feature today.
- No-ops (skips silently, no error) if the client has no email on file.

## Architecture

New file `src/lib/session-email.ts` with two functions:

- `sendSessionScheduledEmail(sessionId: string): Promise<void>` — for one-off bookings.
- `sendSeriesScheduledEmail(seriesId: string): Promise<void>` — for recurring series, called once
  right after series creation.

Both functions, using a service-role client:

1. Resolve the session/series → client (`id, org_id, owner_id, email`). No-op if no email.
2. Resolve subscription via `getSubscription(client.owner_id)` / `isPaidPlan`. No-op if not paid.
3. Resolve business identity via the existing `invoiceLetterhead` / `invoiceLogo` helpers
   (`src/lib/invoice-letterhead.ts`) from `profile`/`organisation` — same as
   `src/app/api/clients/[id]/messages/route.ts`.
4. Compose subject/html/text (see Content below).
5. Send via the existing `sendEmail()` (`src/lib/email-notifications.ts`), with
   `fromName: senderName`, `fromEmail: process.env.RESEND_MESSAGING_FROM_EMAIL`, and
   `replyTo: buildReplyToAddress(client.id, senderName)` (`src/lib/client-messages.ts`) — so a
   reply lands in the same client inbox as the existing Client Email Messaging feature.

The whole body of each function is wrapped in try/catch and never throws — errors are logged via
`console.error` and swallowed. Callers do not need their own error handling.

### Call sites

1. **One-off booking** — `src/components/clients/NewSessionModal.tsx`, after the existing
   `sessions` insert succeeds (~line 176 today). The modal calls a new route,
   `POST /api/clients/[id]/sessions/[sessionId]/notify-scheduled`, which does nothing but call
   `sendSessionScheduledEmail(sessionId)`. This is a fire-and-forget `fetch` (not awaited before
   `router.push`) so email latency never delays the booking UX, and any failure is invisible to
   the user (it's already non-fatal inside the helper, so the route always returns 200).
2. **Recurring series** — `src/app/api/clients/[id]/sessions/series/route.ts`, called directly
   (no HTTP hop, already server-side) right after `topUpSeries(...)`, before the response is
   returned. Wrapped so a failure never affects the API response.

## Content

Minimal, plain-paragraph style matching the rest of the codebase's transactional emails (no CTA
button) — `paragraph()`-style HTML, dates formatted `en-AU` / `Australia/Sydney` like other
scheduling emails (`video/schedule/route.ts`).

- **One-off**: subject line naming the date (e.g. "Session confirmed — Tue 14 Jul"). Body:
  session title, formatted date/time, duration, and subject name (joined from `subjects` via
  `subject_id`) if set.
- **Series**: subject line indicating a recurring session is set up (e.g. "Your recurring
  session is confirmed"). Body: series title, cadence description derived from
  `recurrence_interval` ("every week" / "every 2 weeks" / "every month") and the first
  occurrence's day-of-week + time, and duration.

Both include the same "you can reply directly to this email" reassurance line used in
`messages/route.ts`.

## Error handling

Booking success is never coupled to email success. If Resend is unconfigured, the client has no
email, the plan isn't paid, or the send fails, the helper no-ops or catches the error and logs it
— the session/series is still created normally. No retry queue (matches `sendEmail()`'s existing
no-op-on-unconfigured behaviour elsewhere in the codebase).

## Testing (manual — no test runner in this project)

- `pnpm run build` clean.
- Book a one-off session for a test client (with an email, on a paid-plan account) → confirm a
  branded email arrives with correct date/time/duration, and that replying routes into the
  client's message thread.
- Book a recurring series → confirm exactly **one** email arrives (not one per occurrence), and
  that the cadence description reads correctly for weekly/fortnightly/monthly.
- Book a session for a client with no email on file → confirm no error, booking still succeeds.
- Spot-check on a free-plan account → confirm no email is sent (code-review the gate if not
  practical to test live).
