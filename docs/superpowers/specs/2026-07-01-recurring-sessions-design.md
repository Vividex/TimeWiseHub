# Recurring Sessions — Design Spec

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## What we're building

Sessions (Phase 14) currently must be booked one at a time. Coaches/consultants who see a client
on a fixed cadence (e.g. every Tuesday) have to manually create each session. This adds the
ability to mark a session as recurring — weekly, fortnightly, or monthly — so future occurrences
are generated automatically and visible on the calendar in advance, instead of appearing one at a
time as each prior session completes.

## Out of scope

- Daily recurrence (only weekly/fortnightly/monthly)
- Custom end dates or occurrence counts — series run indefinitely until explicitly cancelled
- Editing a whole series at once (e.g. "change the time for all future occurrences") — each
  generated occurrence is edited individually via the existing session detail page
- Per-occurrence checklist customisation carrying forward — each new occurrence always copies
  fresh from the client's current saved template (Phase 14 behaviour), not from a prior occurrence

---

## Data model

New migration:

```sql
create type public.session_recurrence_interval as enum ('weekly', 'fortnightly', 'monthly');

create table public.session_series (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients on delete cascade,
  org_id              uuid references public.organisations on delete cascade,
  created_by          uuid not null references public.profiles on delete cascade,
  title               text not null,
  duration_minutes    integer not null default 60,
  recurrence_interval public.session_recurrence_interval not null,
  next_scheduled_at   timestamptz not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table public.sessions
  add column series_id uuid references public.session_series(id) on delete set null;
```

`session_series` is the recurring "definition." `sessions.series_id` links each generated
occurrence back to it, mirroring the nullable `program_id` FK pattern already on `sessions`
(Phase 4) — `on delete set null` so deleting a series definition never cascades into deleting real
session history.

RLS on `session_series` mirrors the existing `sessions` policies: org members can view; org
owner/admin/manager can manage (insert/update/delete).

---

## Generation logic

**Buffer size:** 8 upcoming occurrences kept generated per active series at all times.

One new module, `src/lib/sessions/series.ts`, shared by both entry points and the cron:

- `generateNextOccurrence(service, series)` — inserts one `sessions` row at
  `series.next_scheduled_at` (`title`/`duration_minutes`/`client_id`/`org_id`/`created_by` copied
  from the series, `series_id` set, `status: 'scheduled'`), copies the client's current
  `client_session_templates` into `session_todos` for the new row (identical logic to the existing
  `NewSessionModal.tsx` copy-on-create behaviour), advances `series.next_scheduled_at` by the
  interval (`+7d` / `+14d` / `+1 month`), and returns the new session.
- `topUpSeries(service, seriesId, target = 8)` — counts existing sessions in the series where
  `status = 'scheduled' AND scheduled_at >= now()`; calls `generateNextOccurrence` in a loop until
  the count reaches `target`.

**Architecture note:** plain one-off session creation stays exactly as it is today — a direct
browser-side Supabase insert in `NewSessionModal.tsx`, no API route. Recurring-series operations
are the one deliberate exception: they go through server-side API routes using the service client,
because the daily cron needs to run the *exact same* generation logic server-side, and duplicating
it in both a client component and a cron route would be a maintenance hazard. This is scoped
narrowly to series operations — it doesn't change how regular sessions are created or edited.

### API routes

- `POST /api/clients/[id]/sessions/series` — creates a new series (used by the New Session modal's
  "Repeat" option). Body: `{ title, scheduledAt, durationMinutes, recurrenceInterval }`. Creates the
  `session_series` row with `next_scheduled_at = scheduledAt`, then calls `topUpSeries` (which
  generates the first occurrence at exactly the requested time, plus 7 more). Returns the series and
  the first generated session's id, so the caller can navigate to it exactly as today.
- `POST /api/sessions/[id]/series` — converts an existing single session into occurrence #1 of a
  new series (used by "Make recurring" on the session detail page). Body: `{ recurrenceInterval }`.
  Creates the series with `next_scheduled_at` = the existing session's `scheduled_at` advanced by
  one interval (since the existing session already *is* occurrence #1), sets that session's
  `series_id`, then calls `topUpSeries` to generate the remaining 7.
- `POST /api/sessions/series/[seriesId]/cancel` — sets `is_active = false` and deletes every
  `sessions` row in that series where `status = 'scheduled'` (not-yet-happened occurrences,
  regardless of exact timestamp — a scheduled session that's already overdue but never run is still
  "not yet happened"). Completed sessions are never touched.
- `GET /api/cron/process-recurring-sessions` — daily, same `CRON_SECRET` Bearer-auth pattern as the
  existing crons. For every `session_series` row where `is_active = true`, calls `topUpSeries`.
  Added to `vercel.json` alongside the existing four cron entries.

All three POST routes require the caller to be an org owner/admin/manager for the relevant client's
org (same bar as who can otherwise manage sessions).

---

## UI entry points

1. **`NewSessionModal.tsx`** — add a "Repeat" dropdown (None / Weekly / Fortnightly / Monthly)
   below the existing duration field. "None" keeps today's exact behaviour unchanged (direct
   Supabase insert). Any other value calls `POST /api/clients/[id]/sessions/series` instead, then
   navigates to the returned first session — same UX as today, just a different first occurrence
   arrives with 7 future siblings already on the calendar.
2. **Session detail page** — new component `SessionRecurrence.tsx` (same pattern as Phase 4's
   `SessionProgramLink`), rendered in the header next to the status badge:
   - No `series_id` → **"Make recurring"** button opens a small modal to pick the interval, calls
     `POST /api/sessions/[id]/series`.
   - `series_id` set, series `is_active` → a **"Recurring: Weekly"**-style badge plus a **"Stop
     recurring"** button, calling the cancel route.
   - `series_id` set, series cancelled (`is_active = false`) → no badge, no "Make recurring" button
     (a session only ever starts one series in its lifetime, keeping the model simple).

The session detail server page gains one small extra query: if the session has a `series_id`,
fetch that `session_series` row's `recurrence_interval` and `is_active` alongside the existing
session fetch, and pass it down.

---

## Files touched

**New:**
- `supabase/schema-075-recurring-sessions.sql`
- `src/lib/sessions/series.ts`
- `src/app/api/clients/[id]/sessions/series/route.ts`
- `src/app/api/sessions/[id]/series/route.ts`
- `src/app/api/sessions/series/[seriesId]/cancel/route.ts`
- `src/app/api/cron/process-recurring-sessions/route.ts`
- `src/components/clients/SessionRecurrence.tsx`

**Modified:**
- `src/components/clients/NewSessionModal.tsx` — Repeat dropdown, conditional API call
- `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` — fetch linked series info
- `src/components/clients/SessionDetailClient.tsx` — render `SessionRecurrence`
- `vercel.json` — add the new cron entry
