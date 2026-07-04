# Dashboard "Today" Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's 7-day "Upcoming" preview with a single-day "what's on today"
agenda merging scheduled video meetings, client sessions, calendar events, and task deadlines
(due today or overdue) into one chronological, actionable list.

**Architecture:** No schema changes — this reuses `scheduled_calls`, `sessions`, `calendar_events`,
and `tasks`, all already queried elsewhere in `dashboard/page.tsx`. Three changes: (1) a new
timezone-safe day-boundary helper, since the existing day/week boundary math resolves in the
server's local timezone (UTC on Vercel) rather than Australia/Sydney — invisible across a 7-day
window, but wrong for a large fraction of the business day once scoped to exactly today; (2)
narrower/additional queries in `dashboard/page.tsx`; (3) `DashboardUpcoming.tsx` extended with two
new item kinds (`session`, `task`) alongside its existing `meeting`/`event` kinds.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase.
No new npm dependencies (`Intl.DateTimeFormat` covers the timezone math — built into Node/browsers).

## Global Constraints

- No new npm dependencies.
- No new database migrations — every data source already exists.
- Verification gate: `pnpm run build` (tsc + eslint) after every task. No test runner in this
  project — manual browser smoke test substitutes for automated tests (Task 4).
- All Tailwind classes must include `dark:` variants (this UI is not hard-coded dark, unlike the
  video call room) — match the existing `DashboardUpcoming.tsx` pattern already in the file.
- Task deadlines shown here are personal (assignee = current user) — org-wide task deadlines are
  already covered by the existing Team Tasks dashboard section; do not duplicate that data here.
- Calendar events stay personal-scope (`created_by = user`), unchanged from today — only their
  date bound changes, not their ownership filter. Meetings and sessions are org-wide, matching
  their existing scope elsewhere on this dashboard.

---

## Task 1: Timezone-safe "today" boundary helper

**Files:**
- Create: `src/lib/today.ts`

**Interfaces:**
- Produces: `getTodayBoundsSydney(now?: Date): { todayStart: Date; todayEnd: Date }` — consumed by
  Task 2.

- [ ] **Step 1: Write the helper**

Create `src/lib/today.ts`:

```typescript
const SYDNEY_TZ = 'Australia/Sydney'

function sydneyOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYDNEY_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const offset = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+10:00'
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 600 // fallback: AEST, no daylight saving
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

/** Start/end of the Australia/Sydney calendar day containing `now`, as real UTC instants. */
export function getTodayBoundsSydney(now = new Date()): { todayStart: Date; todayEnd: Date } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [year, month, day] = ymd.split('-').map(Number)
  const offsetMinutes = sydneyOffsetMinutes(now)
  const todayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60_000)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return { todayStart, todayEnd }
}
```

- [ ] **Step 2: Sanity-check the boundary math manually**

There's no test runner in this project — verify with a temporary throwaway check instead of a real
test file. Temporarily add this to the bottom of `src/lib/today.ts`, run it once, then remove it
before committing:

```typescript
if (process.argv[1]?.endsWith('today.ts')) {
  // AEST check (July — no daylight saving, UTC+10)
  console.log('July:', getTodayBoundsSydney(new Date('2026-07-04T02:00:00Z')))
  // AEDT check (January — daylight saving, UTC+11)
  console.log('January:', getTodayBoundsSydney(new Date('2026-01-15T13:00:00Z')))
}
```

Run: `npx tsx src/lib/today.ts`

Expected: the July case (`2026-07-04T02:00:00Z`, which is `2026-07-04 12:00` Sydney time) should
print a `todayStart` of `2026-07-03T14:00:00.000Z` (midnight AEST is 14:00 UTC the previous day)
and `todayEnd` 24 hours later. The January case (`2026-01-15T13:00:00Z`, which is
`2026-01-16 00:00` Sydney time under AEDT) should print a `todayStart` of
`2026-01-15T13:00:00.000Z` (midnight AEDT is 13:00 UTC the same day). If either offset is off by
an hour, the DST handling is wrong — re-check `sydneyOffsetMinutes`.

Remove the temporary `if (process.argv[1]...)` block once confirmed.

- [ ] **Step 3: Build check**

Run: `pnpm run build`
Expected: passes clean. Nothing imports this file yet, so no functional change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/today.ts
git commit -m "feat: dashboard Today section — Sydney-aware day boundary helper"
```

---

## Task 2: Data layer — `dashboard/page.tsx`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getTodayBoundsSydney` from Task 1.
- Produces: `sessions: UpcomingSession[]` and `tasks: UpcomingTask[]` props passed into
  `DashboardUpcoming` (types defined in Task 3, this task supplies matching data shapes).

- [ ] **Step 1: Read the current file**

Read `src/app/dashboard/page.tsx` in full before editing — it's already been read once this
session; re-read to confirm no drift since then.

- [ ] **Step 2: Replace the date-boundary block and query bounds**

Find this block (around line 108-116):

```typescript
  // Date helpers
  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const nextWeek   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const todayStartIso  = todayStart.toISOString()
  const nextWeekIso    = nextWeek.toISOString()
```

Replace with:

```typescript
  // Date helpers
  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)
  const { todayStart, todayEnd } = getTodayBoundsSydney(now)

  const todayStartIso = todayStart.toISOString()
  const todayEndIso   = todayEnd.toISOString()
```

Add the import at the top of the file, alongside the existing `getWeekBounds` import:

```typescript
import { getTodayBoundsSydney } from '@/lib/today'
```

Also update the existing type-only import (near the top of the file) to pull in the two new types
Task 3 adds to `DashboardUpcoming.tsx`:

```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask } from '@/components/dashboard/DashboardUpcoming'
```

(This import will fail to resolve `UpcomingSession`/`UpcomingTask` until Task 3 lands — expected,
same as the Step 6 build failure below.)

- [ ] **Step 3: Narrow the meetings and calendar-events queries to today, add sessions query**

Find the stage-1 `Promise.all` block (around line 119-153). Replace the `meetingsRes` and
`calendarRes` entries' date bounds, and add a new `sessionsListRes` entry:

```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes] = await Promise.all([
    orgId
      ? supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('scheduled_at', weekStart.toISOString())
          .lt('scheduled_at', weekEnd.toISOString())
      : Promise.resolve({ count: 0, data: null, error: null }),
    orgId
      ? supabase.from('projects').select('id', { count: 'exact' }).eq('org_id', orgId).eq('status', 'active')
      : supabase.from('projects').select('id', { count: 'exact' }).eq('owner_id', user.id).eq('status', 'active'),
    orgId
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('archived', false)
      : supabase.from('clients').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('archived', false),
    orgId
      ? supabase
          .from('scheduled_calls')
          .select('id, title, starts_at')
          .eq('org_id', orgId)
          .gte('starts_at', todayStartIso)
          .lt('starts_at', todayEndIso)
          .order('starts_at')
          .limit(10)
      : Promise.resolve({ data: [] as { id: string; title: string; starts_at: string }[], error: null }),
    supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, all_day')
      .eq('created_by', user.id)
      .gte('start_at', todayStartIso)
      .lt('start_at', todayEndIso)
      .order('start_at')
      .limit(10),
    orgId
      ? supabase
          .from('sessions')
          .select('id, title, scheduled_at, client_id, clients(name)')
          .eq('org_id', orgId)
          .gte('scheduled_at', todayStartIso)
          .lt('scheduled_at', todayEndIso)
          .order('scheduled_at')
          .limit(10)
      : Promise.resolve({ data: [] as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null }[], error: null }),
    getSubscription(user.id),
  ])
```

Note: the first array element is still called `sessionsRes` (the existing week-count query for the
metrics card) — unchanged, do not confuse with the new `sessionsListRes` (today's actual session
rows for the agenda). Both stay, they serve different purposes.

- [ ] **Step 4: Shape the sessions and tasks data for `DashboardUpcoming`**

Find where `meetings`/`events` are currently derived (around line 182-183):

```typescript
  const meetings = (meetingsRes.data ?? []) as UpcomingMeeting[]
  const events   = (calendarRes.data ?? []) as UpcomingEvent[]
```

Replace with (also imports `UpcomingSession`/`UpcomingTask` — added in Task 3, so this task's build
will fail until Task 3 lands; that's expected and called out in Step 6):

```typescript
  const meetings = (meetingsRes.data ?? []) as UpcomingMeeting[]
  const events   = (calendarRes.data ?? []) as UpcomingEvent[]

  const todaySessions: UpcomingSession[] = (
    (sessionsListRes.data ?? []) as unknown as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null }[]
  ).map(s => ({
    id: s.id,
    title: s.title,
    scheduled_at: s.scheduled_at,
    client_id: s.client_id,
    client_name: s.clients?.name ?? 'Client',
  }))

  const todayEndDate = new Date(todayEndIso)
  const todayTasks: UpcomingTask[] = myTasks
    .filter(t => t.due_date && new Date(t.due_date) < todayEndDate)
    .map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date as string,
      project_name: t.projectName,
    }))
```

This reuses `myTasks` (already fetched earlier in this same file for the "My tasks" section below
— no new task query needed) rather than issuing a duplicate request. `myTasks` is already filtered
to `assignee_id = user.id` and `status != 'done'`, so filtering by `due_date < todayEnd` here
naturally captures both due-today and overdue-and-not-done tasks.

- [ ] **Step 5: Update the `DashboardUpcoming` render**

Find (around line 216):

```typescript
        {/* Upcoming meetings + calendar events */}
        <DashboardUpcoming meetings={meetings} events={events} />
```

Replace with:

```typescript
        {/* Today's agenda: meetings, sessions, calendar events, task deadlines */}
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} />
```

- [ ] **Step 6: Build check — expect a failure here, that's fine**

Run: `pnpm run build`
Expected: FAILS with a type error — `UpcomingSession`/`UpcomingTask` aren't exported from
`DashboardUpcoming.tsx` yet, and the component doesn't accept `sessions`/`tasks` props yet. This is
expected; Task 3 resolves it. Do not commit yet.

---

## Task 3: `DashboardUpcoming.tsx` — add session and task item kinds

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`

**Interfaces:**
- Consumes: `UpcomingMeeting`, `UpcomingEvent` (existing, unchanged) plus new `UpcomingSession`,
  `UpcomingTask` types this task defines and Task 2 already produces matching data for.
- Produces: same default export, now accepting `sessions`/`tasks` props.

- [ ] **Step 1: Read the current file**

Read `src/components/dashboard/DashboardUpcoming.tsx` in full (already read this session; re-read
to confirm no drift).

- [ ] **Step 2: Replace the full file contents**

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Video, Clock3, CheckSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

export type UpcomingMeeting = { id: string; title: string; starts_at: string }
export type UpcomingEvent   = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean }
export type UpcomingSession = { id: string; title: string; scheduled_at: string; client_id: string; client_name: string }
export type UpcomingTask    = { id: string; title: string; due_date: string; project_name: string | null }

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
}

type TimedItem =
  | { id: string; title: string; time: string; kind: 'meeting' }
  | { id: string; title: string; time: string; kind: 'event'; allDay: boolean }
  | { id: string; title: string; time: string; kind: 'session'; clientId: string }

export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const timedItems: TimedItem[] = [
    ...meetings.map(m => ({ id: m.id, title: m.title, time: m.starts_at, kind: 'meeting' as const })),
    ...events.map(e => ({ id: e.id, title: e.title, time: e.start_at, kind: 'event' as const, allDay: e.all_day })),
    ...sessions.map(s => ({ id: s.id, title: `${s.title} — ${s.client_name}`, time: s.scheduled_at, clientId: s.client_id, kind: 'session' as const })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  const visibleTasks = tasks.filter(t => !doneIds.has(t.id))
  const todayStartOfDay = new Date()
  todayStartOfDay.setHours(0, 0, 0, 0)

  async function markDone(taskId: string) {
    setDoneIds(prev => new Set(prev).add(taskId))
    const supabase = createClient()
    await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId)
  }

  if (timedItems.length === 0 && visibleTasks.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Today</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visibleTasks.map((task, i) => {
          const overdue = new Date(task.due_date) < todayStartOfDay
          const isLast = i === visibleTasks.length - 1 && timedItems.length === 0
          return (
            <div
              key={`task-${task.id}`}
              className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <button
                onClick={() => markDone(task.id)}
                title="Mark done"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 transition-colors hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400"
              >
                <CheckSquare size={15} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{task.title}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {task.project_name ? `${task.project_name} — ` : ''}Due {fmtDueDate(task.due_date)}
                </p>
              </div>
              {overdue && (
                <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  Overdue
                </span>
              )}
            </div>
          )
        })}
        {timedItems.map((item, i) => (
          <div
            key={`${item.kind}-${item.id}`}
            className={`flex items-center gap-4 px-5 py-4 ${i < timedItems.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              item.kind === 'meeting'
                ? 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400'
                : item.kind === 'session'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400'
            }`}>
              {item.kind === 'meeting' ? <Video size={15} /> : item.kind === 'session' ? <Clock3 size={15} /> : <Calendar size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500">
                {fmtTime(item.time, item.kind === 'event' ? item.allDay : false)}
              </p>
            </div>
            {item.kind === 'meeting' && (
              <Link
                href={`/dashboard/video/${item.id}`}
                className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
              >
                Join
              </Link>
            )}
            {item.kind === 'session' && (
              <Link
                href={`/dashboard/clients/${item.clientId}/sessions/${item.id}`}
                className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
              >
                View
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Notes on this rewrite versus the existing file:
- The old `isToday` amber "Today" badge is removed — every item in this section is now today by
  construction (the queries already scope to today), so the badge was redundant. The amber colour
  is repurposed for the task checkbox instead.
- `doneIds` is local optimistic state — clicking the checkbox hides the task immediately without
  waiting for the round-trip, matching the responsiveness of the existing `MyTasks.tsx` pattern
  elsewhere in the app (same direct `supabase.from('tasks').update(...)` call, no new API route).
- Tasks render first (as a block), then timed items in chronological order — matches the spec's
  "today's checklist ahead of the timed agenda" ordering.

- [ ] **Step 3: Build check**

Run: `pnpm run build`
Expected: passes clean now (Task 2's props now match this component's accepted props).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/components/dashboard/DashboardUpcoming.tsx
git commit -m "feat: dashboard Today section — merge sessions and task deadlines into the agenda"
```

(Both files commit together since Task 2 alone doesn't build — the props/types are split across
both files' changes and only compile together.)

---

## Task 4: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`**

Final clean check after both prior tasks are committed together.

- [ ] **Step 2: Seed today's data for a full check**

Using whichever test org/client you already have (e.g. the one used for the room-chat testing
session): schedule one video meeting for later today, create/confirm one client session scheduled
for today, add one personal calendar event for today, and confirm you have at least one task
assigned to you with a due date of today or earlier that isn't done. Also create one item of each
kind for **tomorrow** — these must NOT appear.

- [ ] **Step 3: Load the dashboard and check the agenda**

- Confirm the section header reads "Today" (not "Upcoming").
- Confirm all four of today's items appear; none of tomorrow's items appear.
- Confirm ordering: task(s) first, then meetings/sessions/events in time order.
- Confirm the overdue task (if any) shows a red "Overdue" tag; a task due exactly today shows no
  tag.
- Click "Join" on the meeting — confirm it opens the call room.
- Click "View" on the session — confirm it opens that session's detail page.
- Click the calendar event — confirm nothing throws (this item type isn't a link in the current
  design; if you want one, that's a follow-up, not a defect).
- Click the task's checkbox — confirm it disappears from the list immediately, then reload the
  page and confirm it's still gone (i.e. the Supabase update actually persisted, not just local
  state).

- [ ] **Step 4: Confirm the timezone fix**

Re-run the manual check from Task 1 Step 2 if you have any doubt, or simply trust it if that check
passed cleanly — there's no separate live check needed beyond confirming today's items (scheduled
at various times of day) all correctly show up as "today" rather than shifting a day in either
direction.

- [ ] **Step 5: Confirm the empty state**

Temporarily test against a day with nothing scheduled (or mentally verify via the code: if
`timedItems.length === 0 && visibleTasks.length === 0`, the component returns `null`) — confirm the
section doesn't render an empty shell.

- [ ] **Step 6: Report pass/fail**

Fix inline if something's off before considering this feature done. No commit needed for this task
unless a fix is required.

---

## Acceptance checklist

- [ ] Task 1: Sydney-aware day-boundary helper, manually verified against known AEST/AEDT instants
- [ ] Task 2: `dashboard/page.tsx` queries narrowed to today (meetings, calendar events), sessions
  query added, task deadlines derived from the existing `myTasks` fetch (no duplicate query)
- [ ] Task 3: `DashboardUpcoming.tsx` renders tasks + timed items (meetings/sessions/events),
  section relabelled "Today", mark-done works and persists
- [ ] Task 4: full manual smoke test passes, including the today/tomorrow boundary check
