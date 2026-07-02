# Video Chat in Sessions — Design Spec

**Date:** 2026-07-02
**Status:** Approved for implementation

---

## What we're building

Let a client Session (Phase 14) have a video call attached to it, so the coach/consultant can
schedule a Daily.co call directly from the session — auto-filled from the session's own time —
and the client (an external, non-logged-in guest) gets emailed a join link immediately, plus a
reminder 1 hour before. Once the call ends, its existing AI-generated summary surfaces right on
the session page.

This links two previously-disconnected features: the Video/calendar feature (`scheduled_calls`,
Daily.co, already has transcription + Claude summarisation + guest-invite email/reminders) and
client Sessions (`sessions`, client-facing appointments with no video capability today).

## Out of scope

- Cancelling/rescheduling a linked call from the session page — use the existing Video page for
  that (the existing `DELETE /api/video/rooms/[name]` route already handles cancellation).
- Multiple calls per session — one session links to at most one call.
- Internal-only instant calls (no client invite) — Sessions are inherently client-facing; every
  session video call gets a client invite.
- Editing the call's time independently of the session's own `scheduled_at`/`duration_minutes` —
  the call is always auto-filled from the session at creation time, not kept in sync afterward.

---

## Data model

```sql
alter table public.scheduled_calls
  add column session_id uuid references public.sessions(id) on delete set null,
  add column reminder_1hour_sent boolean not null default false;
```

Same nullable-FK-with-`on delete set null` pattern already used for `program_id` (sessions →
programs) and `series_id` (sessions → session_series) elsewhere in this codebase. No RLS changes
— existing `scheduled_calls` policies already cover this column.

---

## Creation flow

New route: `POST /api/clients/[id]/sessions/[sessionId]/video-call`

- **Auth**: caller must be org owner/admin/manager (same bar as `POST /api/video/schedule`).
- **Plan gate**: same `isTeamPlan(sub)` check as the existing schedule route — video calls are a
  Business-plan feature; this inherits that restriction rather than opening a side door around it.
- **Steps**:
  1. Fetch the session (`title`, `scheduled_at`, `duration_minutes`, `org_id`, `client_id`) and
     the client (`name`, `email`).
  2. If the client has no email on file, return a 400 with a clear message ("Add an email address
     to this client before scheduling a video call.") — no call is created.
  3. Compute `starts_at = session.scheduled_at`, `ends_at = starts_at + duration_minutes`.
  4. Create the Daily room exactly as `POST /api/video/schedule` does today (`enable_transcription:
     true`, same `exp` calculation).
  5. Insert `scheduled_calls` with `title: session.title`, the computed times, `session_id`, and
     the usual `org_id`/`created_by`/`daily_room_name`/`room_url`.
  6. Insert one `call_invitees` row for the client (`email`, `display_name: client.name`,
     `user_id: null` — clients are never TimeWiseHub users).
  7. Send the invite email — identical template/sender to the one already used in
     `POST /api/video/schedule` (Resend via `sendEmail`, `${APP_URL}/join/${guestToken}` link).

No new email template, no new Daily.co integration code — this route composes existing pieces
around session-specific auto-fill and a single guaranteed invitee (the client).

---

## Reminder

Extends the existing `/api/notifications/upcoming` cron (already running every 5 minutes, already
handling 30-min and 5-min reminders for `scheduled_calls`) with a third block:

- Window: 55–65 minutes ahead of `starts_at` (mirrors the existing 30-min block's ±5-minute
  window shape).
- Gated by the new `reminder_1hour_sent` column, same read-then-flip-flag pattern as the other
  two blocks.
- Same per-invitee branching already in place: `user_id` set → push notification; `user_id` null
  (external guest, which is every session-call client) → email via the same
  `${APP_URL}/join/${guestToken}` link and near-identical copy to the existing 30-min email
  ("starts in about 1 hour" instead of "30 minutes").

No new cron entry in `vercel.json`, no new email infrastructure — purely a third copy-and-adjust
block inside the route that already exists.

---

## UI

New component `SessionVideoCall.tsx` (same pattern as this session's `SessionRecurrence`/
`SessionProgramLink`), rendered in the session detail page header. The session detail server page
gains one query: if a `scheduled_calls` row exists where `session_id` matches, fetch its `id`,
`starts_at`, `room_url`/`daily_room_name`, and `summary`.

Three states:
- **No call linked**: "Schedule video call" button. Clicking opens a small confirm modal showing
  the client's on-file email and the session's date/time ("This will email `<email>` a join link
  for `<date/time>`"), with a "Send invite" action that calls the new route. If the client has no
  email, the button still opens the modal, which shows the API's error message instead of the
  confirm copy and disables sending.
- **Call linked, no summary yet** (call hasn't happened / hasn't been processed): a "Join call"
  button linking to `/dashboard/video/[callId]`, plus the call's scheduled time as plain text.
- **Call linked, summary present**: the "Join call" button stays (in case of re-joining), plus the
  AI summary text displayed inline on the session page — no new AI call, just reading the
  already-stored `scheduled_calls.summary`.

---

## Files touched

**New:**
- `supabase/schema-076-video-chat-sessions.sql`
- `src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts`
- `src/components/clients/SessionVideoCall.tsx`

**Modified:**
- `src/app/api/notifications/upcoming/route.ts` — third reminder block (1 hour)
- `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` — fetch linked call info
- `src/components/clients/SessionDetailClient.tsx` — render `SessionVideoCall`
