# "Sessions This Week" Dashboard Tile + Sessions Overview Page — Design Spec

**Date:** 2026-07-02
**Status:** Approved for implementation

---

## What we're building

Replace the "Hours this week" tile on the home dashboard with "Sessions this week", linking to a
new org-wide `/dashboard/sessions` overview page (mirroring the existing "Active projects" page's
visual pattern) with two sections — sessions happening **this week** (any status) and all other
**scheduled** (future) sessions — each tile flagged as **Recurring** when applicable.

## Out of scope

- An inline "New session" creation form on the new page (sessions are created from within a
  specific client's context — see design decision below).
- Any cap/pagination on the "Scheduled" section — shows everything, no limit.
- Changing what "Hours this week" measured elsewhere in the app (roster/timesheets are untouched;
  only this one dashboard tile and its now-dead supporting queries go away).

---

## Data model

No schema changes. Uses existing `sessions` (`scheduled_at`, `status`, `client_id`, `series_id`,
`org_id`) and `clients` (`name`) tables.

**Week definition:** simple Monday–Sunday calendar week, computed the same way this file already
computes it today (`weekStart` via `(dow + 6) % 7`). This logic is extracted into a shared helper,
`src/lib/week.ts`:

```typescript
export function getWeekBounds(now = new Date()): { weekStart: Date; weekEnd: Date } {
  const dow = now.getDay()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((dow + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { weekStart, weekEnd }
}
```

Both the dashboard tile's count and the new page's "This week" section use `[weekStart, weekEnd)`
against `sessions.scheduled_at`, with **no status filter** — scheduled, in-progress, and
already-completed sessions all count, giving a full picture of the week (like a calendar view)
rather than just remaining workload.

---

## Dashboard tile change

`src/app/dashboard/page.tsx` currently computes `hoursThisWeek` from `time_entries` +
`roster_shifts` queries, used **only** for the tile being replaced — once the tile changes, that
computation (plus its now-unused supporting variables `timeEntrySeconds`, `rosterSeconds`,
`todayDate`, `weekStartDate`, `localNow`, and the `roster_shifts` query itself) becomes dead code
and is removed rather than left stranded.

Replaced with a single `sessions` count query for the current week (`org_id` scoped, no status
filter, `[weekStart, weekEnd)`), producing `sessionsThisWeek`.

`src/components/dashboard/DashboardMetrics.tsx`: the first tile's icon/label/link changes from
`Clock` / "Hours this week" / `/dashboard/roster` to a calendar icon / "Sessions this week" /
`/dashboard/sessions`, keeping the same cyan colour scheme as the tile it replaces. The other
three tiles (Active projects, Tasks complete, Active clients) are untouched.

---

## New page: `/dashboard/sessions`

Server component, following the exact visual pattern of `src/app/dashboard/projects/page.tsx`
(`Tile`/`TileGrid` from `src/components/ui/Tile.tsx`) — but with two sections instead of one, and
no inline creation form.

- **Header:** "Sessions" title + "`<n>` this week" subtitle (mirrors the Projects page's "`<n>`
  active" subtitle).
- **"This week" section:** every org session with `scheduled_at` in `[weekStart, weekEnd)`, any
  status, ordered by `scheduled_at`.
- **"Scheduled" section:** every org session with `status = 'scheduled'` and `scheduled_at >=
  weekEnd` (i.e. not already shown above), no cap, ordered by `scheduled_at`.
- **Each tile:** `title` = session title; `meta` = `"<Client name> · <date/time> · <duration>min ·
  <Status label>"`; `badge` = `{ label: 'Recurring', tone: 'cyan' }` shown only when `series_id`
  is non-null (the `Tile` component has exactly one badge slot, so status is folded into `meta`
  text instead of competing for it); `href` links to the existing session detail page
  (`/dashboard/clients/[clientId]/sessions/[sessionId]`).
- **No org (`orgId` is null):** both sections render empty — client Sessions is an org-only
  feature already (existing `sessions` RLS requires `org_id is not null`), so this isn't a new
  restriction, just consistent with what already exists.

**Why no inline creation form**, unlike the Projects page it otherwise mirrors: creating a session
always requires picking a specific client first (`NewSessionModal` is rendered per-client, on that
client's own Sessions page) — there's no natural "create a session" action that isn't already
scoped to a client. This page is a read-only index; all actions (create, edit, complete, delete,
link a program, make recurring, schedule a call) continue to live on the session detail page they
already live on today.

---

## Files touched

**New:**
- `src/lib/week.ts`
- `src/app/dashboard/sessions/page.tsx`

**Modified:**
- `src/app/dashboard/page.tsx` — replace hours-this-week computation with sessions-this-week count
- `src/components/dashboard/DashboardMetrics.tsx` — swap the first tile
