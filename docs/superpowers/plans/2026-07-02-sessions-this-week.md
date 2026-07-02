# "Sessions This Week" Dashboard Tile + Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's "Hours this week" tile with "Sessions this week", linking to a new org-wide `/dashboard/sessions` page showing this week's sessions and all other scheduled sessions, each flagged Recurring when applicable.

**Architecture:** A shared `getWeekBounds()` helper computes the Monday–Sunday week window (extracted from existing inline logic already on the dashboard page). The dashboard page swaps its hours-this-week query for a sessions-this-week count and removes the now-dead time/roster computation that only fed that one tile. A new page reuses the existing `Tile`/`TileGrid` primitives (same ones the Projects page uses) across two sections.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages.
- All Tailwind classes must include `dark:` variants.
- Week definition: simple Monday–Sunday calendar week (not the org's pay-week-start-day).
- "This week" includes sessions of any status; "Scheduled" is `status = 'scheduled'` sessions
  beyond this week, uncapped.
- No inline session-creation form on the new page — it's a read-only index.
- Supabase's FK-join type gotcha applies: cast joined `clients` via
  `(row.clients as unknown as { name: string } | null)?.name`, matching the existing pattern in
  `src/app/dashboard/projects/page.tsx`.

---

## File Map

**New files:**
```
src/lib/week.ts
src/app/dashboard/sessions/page.tsx
```

**Modified files:**
```
src/app/dashboard/page.tsx                       — replace hours-this-week with sessions-this-week
src/components/dashboard/DashboardMetrics.tsx    — swap the first tile
```

---

## Task 1: Shared week-bounds helper

**Files:**
- Create: `src/lib/week.ts`

**Interfaces:**
- Produces: `getWeekBounds(now?: Date): { weekStart: Date; weekEnd: Date }`
- Consumed by: Task 2, Task 4

- [ ] **Step 1: Write the helper**

Create `src/lib/week.ts`:

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

This is the exact same Monday-start-of-week calculation already inline in
`src/app/dashboard/page.tsx` today (lines 108-112), extracted so a second file (Task 4) doesn't
duplicate it.

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully. Nothing imports this yet — checks it compiles standalone.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/week.ts
  git commit -m "feat: sessions this week — shared getWeekBounds helper"
  ```

---

## Task 2: Dashboard page — sessions-this-week query replaces hours-this-week

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getWeekBounds` (Task 1)
- Produces: `sessionsThisWeek: number` passed to `DashboardMetrics` (consumed by Task 3)

**Context:** `hoursThisWeek` (and its supporting `timeEntrySeconds`/`rosterSeconds` computation,
the `time_entries` query, and the `roster_shifts` query) is used **only** to feed the tile being
replaced — nothing else on this page reads it. Removing it also makes `localNow`, `todayDate`,
and `weekStartDate` dead (they existed only to bound the roster query), so those go too.
`todayStart`/`nextWeek`/`todayStartIso`/`nextWeekIso` stay — they're still used by the
meetings/calendar-events queries below.

- [ ] **Step 1: Replace the full file**

Read `src/app/dashboard/page.tsx` first to confirm it matches this plan's understanding, then
replace its full contents:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MyWork from '@/components/home/MyWork'
import TaskPool from '@/components/tasks/TaskPool'
import TeamTasks from '@/components/tasks/TeamTasks'
import WelcomeBanner from '@/components/WelcomeBanner'
import NudgeBanner from '@/components/NudgeBanner'
import OrgDocuments from '@/components/home/OrgDocuments'
import PendingApprovals from '@/components/home/PendingApprovals'
import DashboardMetrics from '@/components/dashboard/DashboardMetrics'
import DashboardUpcoming from '@/components/dashboard/DashboardUpcoming'
import PersonalTodos from '@/components/dashboard/PersonalTodos'
import QuickActions from '@/components/dashboard/QuickActions'
import type { UpcomingMeeting, UpcomingEvent } from '@/components/dashboard/DashboardUpcoming'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWeekBounds } from '@/lib/week'

type PoolTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
  projects: { id: string; name: string; colour: string } | null
}

type AssignedTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assignee_id: string
  projects: { id: string; name: string; colour: string } | null
}

export default async function DashboardHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null
  const role = membership?.role ?? 'employee'
  const isManager = ['owner', 'admin', 'manager'].includes(role)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, nickname').eq('id', user.id).maybeSingle()
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.nickname ?? ''

  const { data: rawTasks } = await supabase
    .from('tasks')
    .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(name, client_id)')
    .eq('assignee_id', user.id)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTasks = (rawTasks ?? []).map((t: any) => ({
    id: t.id, title: t.title, priority: t.priority, status: t.status,
    due_date: t.due_date, notes: t.notes, assignee_id: t.assignee_id, completed_at: t.completed_at,
    projectName: t.projects?.name ?? null,
    clientId: t.projects?.client_id ?? null,
  }))

  const orgMembersRaw = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedMembers = orgMembersRaw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembersRaw as any[]).map((m: any) => ({ userId: m.user_id as string, displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string }))
    : undefined

  // Manager unassigned pool + assigned team tasks
  let poolTasks: PoolTask[] = []
  let assignedTasks: AssignedTask[] = []
  if (isManager && orgId) {
    const { data: orgProjects } = await supabase
      .from('projects').select('id').eq('org_id', orgId).eq('status', 'active')
    const orgProjectIds = (orgProjects ?? []).map(p => p.id)
    if (orgProjectIds.length > 0) {
      const [{ data: pool }, { data: assigned }] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(id, name, colour)')
          .is('assignee_id', null)
          .neq('status', 'done')
          .in('project_id', orgProjectIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, assignee_id, projects(id, name, colour)')
          .not('assignee_id', 'is', null)
          .neq('status', 'done')
          .in('project_id', orgProjectIds)
          .order('due_date', { ascending: true, nullsFirst: false }),
      ])
      poolTasks = (pool ?? []) as unknown as PoolTask[]
      assignedTasks = (assigned ?? []) as unknown as AssignedTask[]
    }
  }

  // Date helpers
  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const nextWeek   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const todayStartIso  = todayStart.toISOString()
  const nextWeekIso    = nextWeek.toISOString()

  // Stage 1: parallel fetches — projects returns IDs so we can filter tasks in stage 2
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, subscriptionRes] = await Promise.all([
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
          .gte('starts_at', now.toISOString())
          .lte('starts_at', nextWeekIso)
          .order('starts_at')
          .limit(5)
      : Promise.resolve({ data: [] as { id: string; title: string; starts_at: string }[], error: null }),
    supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, all_day')
      .eq('created_by', user.id)
      .gte('start_at', todayStartIso)
      .lte('start_at', nextWeekIso)
      .order('start_at')
      .limit(10),
    getSubscription(user.id),
  ])

  // Stage 2: task counts scoped to active projects
  const activeProjectIds = (projectsRes.data ?? []).map((p: { id: string }) => p.id)

  const [tasksDoneRes, tasksTotalRes] = await Promise.all([
    activeProjectIds.length > 0
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .eq('status', 'done')
          .in('project_id', activeProjectIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    activeProjectIds.length > 0
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .in('project_id', activeProjectIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
  ])

  const sessionsThisWeek = sessionsRes.count ?? 0
  const activeProjects  = projectsRes.count ?? 0
  const activeClients   = clientsRes.count ?? 0
  const tasksCompleted  = tasksDoneRes.count ?? 0
  const tasksTotal      = tasksTotalRes.count ?? 0

  const meetings = (meetingsRes.data ?? []) as UpcomingMeeting[]
  const events   = (calendarRes.data ?? []) as UpcomingEvent[]
  const rosterManaged = isTeamPlan(subscriptionRes) && !!orgId

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">
            {firstName ? `Hi, ${firstName} 👋` : 'Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Here&apos;s what&apos;s happening across your business today.
          </p>
        </div>

        <WelcomeBanner firstName={firstName} />
        <NudgeBanner userId={user.id} />

        {/* Metric cards — all clickable */}
        <DashboardMetrics
          sessionsThisWeek={sessionsThisWeek}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
        />

        {/* Quick actions */}
        <QuickActions rosterManaged={rosterManaged} />

        {/* Upcoming meetings + calendar events */}
        <DashboardUpcoming meetings={meetings} events={events} />

        {/* Personal to-dos */}
        <PersonalTodos />

        {/* My tasks */}
        <div id="my-tasks">
          <MyWork myTasks={myTasks} orgMembers={mappedMembers} />
        </div>

        {isManager && poolTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Unassigned tasks</h2>
            <TaskPool
              initialTasks={poolTasks}
              orgMembers={mappedMembers ?? []}
              currentUserId={user.id}
              currentUserRole={role}
            />
          </div>
        )}

        {isManager && assignedTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Team tasks</h2>
            <TeamTasks
              initialTasks={assignedTasks}
              orgMembers={mappedMembers ?? []}
            />
          </div>
        )}

        {isManager && orgId && (
          <PendingApprovals orgId={orgId} userId={user.id} role={role} />
        )}

        {isManager && orgId && (
          <OrgDocuments orgId={orgId} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. `DashboardMetrics` will show a type error
  at this point since it still expects `hoursThisWeek` — that's expected and fixed by Task 3.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/dashboard/page.tsx
  git commit -m "feat: sessions this week — replace hours-this-week query with sessions count"
  ```

---

## Task 3: DashboardMetrics — swap the first tile

**Files:**
- Modify: `src/components/dashboard/DashboardMetrics.tsx`

**Interfaces:**
- Consumes: `sessionsThisWeek: number` prop (from Task 2)

- [ ] **Step 1: Replace the full file**

Replace the full contents of `src/components/dashboard/DashboardMetrics.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { CalendarClock, FolderOpen, CheckSquare, Users } from 'lucide-react'

type Props = {
  sessionsThisWeek: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
}

type CardProps = {
  icon: React.ElementType
  value: string
  label: string
  iconClass: string
  glowClass: string
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never })

function MetricCard({ icon: Icon, value, label, iconClass, glowClass, href, onClick }: CardProps) {
  const inner = (
    <>
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${glowClass}`} />
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500">{label}</p>
    </>
  )

  const cls = 'relative block overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60 text-left w-full'

  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button onClick={onClick} className={cls}>{inner}</button>
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const header = document.querySelector('header')
  const offset = (header?.offsetHeight ?? 72) + 16
  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top, behavior: 'smooth' })
}

export default function DashboardMetrics({ sessionsThisWeek, activeProjects, tasksCompleted, tasksTotal, activeClients }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        icon={CalendarClock}
        value={String(sessionsThisWeek)}
        label="Sessions this week"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/sessions"
      />
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label="Active projects"
        iconClass="bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
        glowClass="bg-violet-500"
        href="/dashboard/projects"
      />
      <MetricCard
        icon={CheckSquare}
        value={`${tasksCompleted}/${tasksTotal}`}
        label="Tasks complete"
        iconClass="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
        glowClass="bg-emerald-500"
        onClick={() => scrollTo('my-tasks')}
      />
      <MetricCard
        icon={Users}
        value={String(activeClients)}
        label="Active clients"
        iconClass="bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
        glowClass="bg-amber-500"
        href="/dashboard/clients"
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors — the mismatch from Task 2 is now resolved.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/dashboard/DashboardMetrics.tsx
  git commit -m "feat: sessions this week — swap dashboard tile from Hours to Sessions"
  ```

---

## Task 4: Sessions overview page

**Files:**
- Create: `src/app/dashboard/sessions/page.tsx`

**Interfaces:**
- Consumes: `getWeekBounds` (Task 1), `Tile`/`TileGrid` from `@/components/ui/Tile` (existing)

- [ ] **Step 1: Write the page**

Create `src/app/dashboard/sessions/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import { getWeekBounds } from '@/lib/week'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}

const SESSION_COLUMNS = 'id, title, scheduled_at, duration_minutes, status, client_id, series_id, clients(name)'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

type SessionTileData = {
  id: string
  title: string
  clientId: string
  meta: string
  recurring: boolean
}

function mapSession(s: {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  status: string
  client_id: string
  series_id: string | null
  clients: unknown
}): SessionTileData {
  const clientName = (s.clients as unknown as { name: string } | null)?.name ?? 'Unknown client'
  const statusLabel = STATUS_LABEL[s.status] ?? s.status
  return {
    id: s.id,
    title: s.title,
    clientId: s.client_id,
    meta: `${clientName} · ${fmtDateTime(s.scheduled_at)} · ${s.duration_minutes} min · ${statusLabel}`,
    recurring: !!s.series_id,
  }
}

export default async function SessionsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { weekStart, weekEnd } = getWeekBounds()

  const [{ data: thisWeekRaw }, { data: scheduledRaw }] = await Promise.all([
    orgId
      ? supabase
          .from('sessions')
          .select(SESSION_COLUMNS)
          .eq('org_id', orgId)
          .gte('scheduled_at', weekStart.toISOString())
          .lt('scheduled_at', weekEnd.toISOString())
          .order('scheduled_at')
      : Promise.resolve({ data: [], error: null }),
    orgId
      ? supabase
          .from('sessions')
          .select(SESSION_COLUMNS)
          .eq('org_id', orgId)
          .eq('status', 'scheduled')
          .gte('scheduled_at', weekEnd.toISOString())
          .order('scheduled_at')
      : Promise.resolve({ data: [], error: null }),
  ])

  const thisWeek = (thisWeekRaw ?? []).map(mapSession)
  const scheduled = (scheduledRaw ?? []).map(mapSession)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sessions</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {thisWeek.length} this week
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">This week</h2>
          <TileGrid empty="No sessions scheduled this week.">
            {thisWeek.map(s => (
              <Tile
                key={s.id}
                title={s.title}
                meta={s.meta}
                badge={s.recurring ? { label: 'Recurring', tone: 'cyan' } : undefined}
                href={`/dashboard/clients/${s.clientId}/sessions/${s.id}`}
              />
            ))}
          </TileGrid>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Scheduled</h2>
          <TileGrid empty="No further sessions scheduled.">
            {scheduled.map(s => (
              <Tile
                key={s.id}
                title={s.title}
                meta={s.meta}
                badge={s.recurring ? { label: 'Recurring', tone: 'cyan' } : undefined}
                href={`/dashboard/clients/${s.clientId}/sessions/${s.id}`}
              />
            ))}
          </TileGrid>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. `/dashboard/sessions` should appear in
  the build's route list output.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/dashboard/sessions/page.tsx
  git commit -m "feat: sessions this week — sessions overview page"
  ```

---

## Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`** — final clean check after all tasks.

- [ ] **Step 2: Manual browser smoke test** (no test runner in this project):
  1. Open `/dashboard` — confirm the first metric tile now reads "Sessions this week" with a
     sensible count, and clicking it navigates to `/dashboard/sessions`.
  2. On `/dashboard/sessions`, confirm the "This week" section shows sessions scheduled Mon–Sun
     of the current week (create/check one if none exist), and the count in the subtitle matches
     the tile.
  3. Confirm a session that's part of a recurring series shows the "Recurring" badge; a
     non-recurring one doesn't.
  4. Confirm the "Scheduled" section shows only `status = 'scheduled'` sessions beyond this week,
     and doesn't duplicate anything already shown in "This week".
  5. Click a tile and confirm it navigates to that session's existing detail page.
  6. Confirm the rest of the dashboard home page (meetings, personal to-dos, my tasks, etc.)
     still renders correctly — nothing else should have changed.

- [ ] **Step 3:** Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] Task 1: `getWeekBounds()` compiles clean, matches the exact prior inline logic
- [ ] Task 2: dashboard page computes `sessionsThisWeek`, dead hours/roster code removed
- [ ] Task 3: `DashboardMetrics` shows "Sessions this week" linking to `/dashboard/sessions`
- [ ] Task 4: `/dashboard/sessions` renders both sections correctly with Recurring badges
- [ ] Task 5: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for Task 5 (no test runner in this project).
