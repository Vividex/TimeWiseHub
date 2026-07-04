# Dashboard "Today" Section

## Goal
Replace the dashboard's 7-day "Upcoming" preview with a single-day "what's on today" agenda
merging scheduled video meetings, client sessions, calendar events, and task deadlines (due today
or overdue) into one chronological, actionable list.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-04-dashboard-today-section-design.md`
- Source plan: `docs/superpowers/plans/2026-07-04-dashboard-today-section.md`
- No schema changes — reuses `scheduled_calls`, `sessions`, `calendar_events`, `tasks`, all
  already queried elsewhere in `dashboard/page.tsx`.
- New Sydney-aware day-boundary helper (`src/lib/today.ts`) — the existing day/week boundary math
  resolves in the server's local timezone (UTC on Vercel), invisible across a 7-day window but
  wrong for a large fraction of the business day once scoped to exactly today.
- Task deadlines are personal (assignee = current user), reusing the *already-fetched* `myTasks`
  data in `dashboard/page.tsx` rather than issuing a new query — no duplicate round-trip.
- Meetings and sessions stay org-wide; calendar events stay personal-scope (`created_by = user`) —
  only their date bound changes, not their ownership filter.
- No new npm dependencies (`Intl.DateTimeFormat` covers the timezone math).

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants (this UI is not hard-coded dark, unlike the
  video call room).

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1's temporary manual verification script must be added AND removed within the same turn —
  never commit it.
- C-4 needs a manual browser smoke test (no test runner) before ticking it done.

---

## C-1 — Sydney-aware "today" boundary helper

*Codex edits:*
- [x] Create `src/lib/today.ts`:
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
- [x] Report back "Done this turn" listing the file created. Do NOT add any temporary
  verification script — the conductor handles manual verification separately (Step below).

*Conductor:*
- [x] Sanity-check the boundary math manually: temporarily append to the bottom of
  `src/lib/today.ts`:
  ```typescript
  if (process.argv[1]?.endsWith('today.ts')) {
    console.log('July:', getTodayBoundsSydney(new Date('2026-07-04T02:00:00Z')))
    console.log('January:', getTodayBoundsSydney(new Date('2026-01-15T13:00:00Z')))
  }
  ```
  Run `npx tsx src/lib/today.ts`. Expected: July case prints `todayStart`
  `2026-07-03T14:00:00.000Z` (midnight AEST = 14:00 UTC previous day); January case prints
  `todayStart` `2026-01-15T13:00:00.000Z` (midnight AEDT = 13:00 UTC same day). Remove the
  temporary block afterward — never commit it.
  Result: both cases matched exactly.
- [x] `pnpm run build` — must pass clean. Nothing imports this yet.
- [x] Commit: `git add src/lib/today.ts && git commit -m "feat: dashboard Today section — Sydney-aware day boundary helper"`

---

## C-2 — `dashboard/page.tsx` data layer

*Codex edits:*
- [x] Read `src/app/dashboard/page.tsx` first, then:
  1. Replace the date-boundary block:
     ```typescript
     // Date helpers
     const now = new Date()
     const { weekStart, weekEnd } = getWeekBounds(now)
     const { todayStart, todayEnd } = getTodayBoundsSydney(now)

     const todayStartIso = todayStart.toISOString()
     const todayEndIso   = todayEnd.toISOString()
     ```
  2. Add imports:
     ```typescript
     import { getTodayBoundsSydney } from '@/lib/today'
     ```
     and update the existing type-only import to:
     ```typescript
     import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask } from '@/components/dashboard/DashboardUpcoming'
     ```
     (`UpcomingSession`/`UpcomingTask` won't resolve until C-3 lands — expected, matches the
     build-failure note below.)
  3. In the stage-1 `Promise.all`, change `meetingsRes`'s bounds from
     `.gte('starts_at', now.toISOString()).lte('starts_at', nextWeekIso)` to
     `.gte('starts_at', todayStartIso).lt('starts_at', todayEndIso)`, and `calendarRes`'s bounds
     from `.gte('start_at', todayStartIso).lte('start_at', nextWeekIso)` to
     `.gte('start_at', todayStartIso).lt('start_at', todayEndIso)`. Add a new array entry
     `sessionsListRes` (keep the existing `sessionsRes` count query untouched — it's a different,
     still-needed query for the metrics card):
     ```typescript
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
     ```
     Update the destructuring to include it in the matching position:
     `const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes] = await Promise.all([...])`.
  4. Remove `nextWeek`/`nextWeekIso` — no longer used anywhere in this file once the two queries
     above are updated.
  5. After the existing `meetings`/`events` derivation, add:
     ```typescript
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
  6. Update the `DashboardUpcoming` render:
     ```typescript
     <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} />
     ```
- [x] Report back "Done this turn" listing the file changed. Build WILL fail after this turn
  (C-3 hasn't landed yet) — that's expected, do not treat it as a blocker.

*Conductor:*
- [x] `pnpm run build` — expect a type error (`UpcomingSession`/`UpcomingTask` not exported yet
  from `DashboardUpcoming.tsx`). Expected here, resolved by C-3. Do not commit yet — C-2 and C-3
  commit together once both land (see C-3's commit step).
  Result: confirmed the expected type error (`Module has no exported member 'UpcomingSession'`).
  Also fixed a stale JSX comment above `<DashboardUpcoming>` myself (still said "Upcoming
  meetings + calendar events") — a gap in this spec's own transcription from the plan, not a
  Codex error; too trivial to round-trip through a Codex turn.

---

## C-3 — `DashboardUpcoming.tsx` — session and task item kinds

*Codex edits:*
- [x] Read `src/components/dashboard/DashboardUpcoming.tsx` first, then replace its full contents:
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
- [x] Report back "Done this turn" listing the file changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean now (C-2's props now match this component's accepted
  props).
- [x] Commit both files together (they only compile together):
  `git add src/app/dashboard/page.tsx src/components/dashboard/DashboardUpcoming.tsx && git commit -m "feat: dashboard Today section — merge sessions and task deadlines into the agenda"`

---

## C-4 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after C-1..C-3 are committed.
- [ ] Seed today's data: one video meeting later today, one client session scheduled today, one
  personal calendar event today, at least one non-done task assigned to you due today or earlier.
  Also seed one of each kind for tomorrow — these must NOT appear.
- [ ] Load the dashboard and confirm:
  - Section header reads "Today" (not "Upcoming").
  - All of today's items appear; none of tomorrow's items appear.
  - Ordering: task(s) first, then meetings/sessions/events in time order.
  - Overdue task shows a red "Overdue" tag; a task due exactly today shows no tag.
  - "Join" on the meeting opens the call room.
  - "View" on the session opens that session's detail page.
  - Clicking the task's checkbox removes it from the list immediately, and it's still gone after a
    reload (confirms the Supabase update persisted, not just local state).
  - Empty state: with nothing scheduled today, the section doesn't render at all.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] C-1: `src/lib/today.ts` compiles clean, boundary math manually verified against known
  AEST/AEDT instants
- [ ] C-2: `dashboard/page.tsx` queries narrowed to today, sessions query added, task deadlines
  derived from the existing `myTasks` fetch (no duplicate query)
- [ ] C-3: `DashboardUpcoming.tsx` renders tasks + timed items, section relabelled "Today",
  mark-done works and persists
- [ ] C-4: full manual smoke test passes, including the today/tomorrow boundary check

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-4 (no test runner in this project).
