# Dashboard "Today" Section — Design

## Goal
Replace the existing "Upcoming" section on the main dashboard (7-day preview of meetings +
personal calendar events) with a comprehensive, single-day "what's on today" agenda: scheduled
video meetings, client sessions, calendar events, and task deadlines, merged into one
chronological, actionable list.

## Out of scope
- Staff on leave today, invoices due today, or any other "etc" category not explicitly named —
  raised during brainstorming and deliberately deferred; add as a follow-up if wanted, not bundled
  into this pass.
- A calendar-grid / hour-timeline visual layout — the existing flat chronological list pattern
  (already used by `DashboardUpcoming`) is kept; this is a data/scope change to that pattern, not a
  visual redesign.
- Changing task-completion mechanics, session/meeting data models, or any RLS policy — this only
  changes what's queried and displayed on the dashboard.

## Problem with the current implementation
`DashboardUpcoming` (`src/components/dashboard/DashboardUpcoming.tsx`) already merges
`scheduled_calls` (video meetings) and `calendar_events` into one sorted list — but:
1. It's scoped to the next 7 days, not today specifically.
2. It's missing **sessions** (client sessions — currently only surfaced as a count on a metric
   card) and **task deadlines** entirely.
3. Day-boundary math in `dashboard/page.tsx` (`todayStart`, and `getWeekBounds()` in
   `src/lib/week.ts`) uses `Date` methods that resolve in the **server's local timezone** — UTC on
   Vercel, not Australia/Sydney. Across a 7-day window this is invisible; scoped to exactly one
   day it would be wrong for a large fraction of the business's operating hours (e.g. at 9am
   Sydney time, the server clock still reads the previous UTC day).

## Design

### 1. Day-boundary helper (prerequisite fix)
New function in `src/lib/week.ts` (or a new `src/lib/today.ts` — implementation detail for the
plan to decide): given `now`, return `{ todayStart, todayEnd }` as real UTC `Date`/ISO instants
representing the start and end of the *Australia/Sydney* calendar day containing `now`. Computed
via `Intl.DateTimeFormat` or a fixed offset lookup — no new dependency needed (`Intl` is built in).
This is the one place "today" gets defined; both the new queries and (opportunistically, since it's
the same bug) `calendar_events`'s existing "next 7 days" bound should use it for consistency.

### 2. Data layer — `src/app/dashboard/page.tsx`
Within the existing stage-1 `Promise.all`:
- `scheduled_calls`: change `.gte('starts_at', now.toISOString()).lte('starts_at', nextWeekIso)` to
  `.gte('starts_at', todayStart).lt('starts_at', todayEnd)`. Stays org-wide (unchanged scope).
- `calendar_events`: same bound change. Stays personal (`created_by = user.id`, unchanged scope —
  confirmed in brainstorming, not widened to org-wide).
- New query: `sessions` — org-wide (`org_id = orgId`), `scheduled_at` within today's bounds, any
  `status`, joined to `clients(name)` for display. Mirrors the existing `sessionsThisWeek` count
  query's scope but for a single day and fetching full rows instead of a count.
- New query: `tasks` — `assignee_id = user.id`, `status != 'done'`, `due_date <= todayEnd` (this
  naturally includes both due-today and overdue-undone tasks, no separate "overdue" query needed).
  Personal scope only (org-wide task deadlines are already covered by the existing Team Tasks
  section for managers — deliberately not duplicated here, confirmed in brainstorming).

`nextWeek`/`nextWeekIso` become unused by this section once migrated (still used elsewhere? — to
be confirmed during planning; remove only if genuinely dead).

### 3. Component — `DashboardUpcoming.tsx`
Extends the existing merged-list pattern with two new item kinds, alongside the existing
`meeting` and `event` kinds:
- **`session`**: clock icon, emerald (distinct from the existing violet meeting / cyan event
  colours). Label: session title + client name. Links to
  `/dashboard/clients/[clientId]/sessions/[sessionId]`.
- **`task`**: checkbox icon, amber. Label: task title (+ project name if present, matching the
  existing `MyTasks.tsx` display convention). Overdue tasks (`due_date` before today's start) get a
  red "Overdue" tag instead of the existing "Today" amber tag. Clicking the checkbox marks it done
  inline via the same direct Supabase client mutation `MyTasks.tsx` already uses
  (`supabase.from('tasks').update({ status: 'done', completed_at: ... }).eq('id', task.id)`) — no
  new API route.

Sorting: `meeting`/`session`/`event` items sort by their actual start time as today. `task` items
have no time-of-day (only a date), so they sort as a block at the very top of the list — read as
"today's checklist" ahead of the timed agenda, then the rest of the day in chronological order.

### 4. Empty state
Unchanged: if the combined list is empty, the section renders nothing (`return null`), same as
today.

## Testing
No test runner in this project (per `CLAUDE.md`). Verification is `pnpm run build` (tsc + eslint)
plus a manual browser smoke test:
- Load the dashboard with at least one item of each kind scheduled for today, one overdue task,
  and one item scheduled for tomorrow (must NOT appear).
- Confirm each item's action works: Join (meeting), session detail link, task checkbox
  (mark-done, confirm it disappears from the list), calendar event link.
- Confirm the timezone fix: check behavior specifically in the early-morning Sydney / still-UTC-
  previous-day window (or verify the boundary math directly against a known instant) since this is
  exactly the case that was previously wrong.
- Confirm empty state: temporarily point at a day with nothing scheduled, confirm the section
  disappears rather than rendering an empty shell.
