# Business Timesheet Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace clock-in/out with "Log Additional Hours" for Business-plan members, show those hours on the roster grid, add a manager approval detail modal with overtime flagging, and fix the timesheet cron double-counting bug.

**Architecture:** Five self-contained tasks — cron fix → detail API → additional-hours form + page gate → roster grid amber blocks → approval detail modal. Each task compiles and builds independently before the next begins.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr` + service client), `pnpm run build` as the verification gate (no test runner).

## Global Constraints

- Verification gate: `pnpm run build` must pass clean after every task (runs tsc + eslint).
- No new npm dependencies.
- Supabase FK joins infer as arrays — always cast via `as unknown as T`.
- Service client (`createServiceClient`) for server-side privileged reads; browser client (`createClient` from `@/lib/supabase-browser`) for client components.
- Business plan = `isTeamPlan(subscription)`. The existing `rosterManaged` boolean already captures `isTeamPlan(subscription) && !!orgId`.
- Additional hours color on roster: `bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300` (distinct from draft-shift amber and published-shift cyan).
- Overtime threshold: 38 hours = 136800 seconds.
- Do NOT touch billing, auth, or Stripe code.

---

### Task 1: Fix generate-weekly cron to include additional time entries

**Files:**
- Modify: `src/app/api/timesheets/generate-weekly/route.ts`

**Interfaces:**
- Consumes: nothing new — extends existing cron route
- Produces: corrected `total_seconds` in upserted timesheets (roster + entry seconds)

- [ ] **Step 1: Read and understand the current cron logic**

Open `src/app/api/timesheets/generate-weekly/route.ts`. Note that `secondsByUser` is built only from `roster_shifts`. The fix adds a second query per org to fetch `time_entries` for the same week, then adds entry seconds to each user's roster total.

- [ ] **Step 2: Replace the per-org processing block**

Find the block starting with `const secondsByUser = new Map<string, number>()` and ending with the `for (const [userId, totalSeconds] of secondsByUser)` loop. Replace the entire `for (const org of orgs)` body with:

```ts
for (const org of orgs) {
  const weekStart = addDays(yesterdayISO, -6)

  const { data: shifts } = await service
    .from('roster_shifts')
    .select('user_id, start_time, end_time')
    .eq('org_id', org.id)
    .eq('published', true)
    .is('deleted_at', null)
    .gte('date', weekStart)
    .lte('date', yesterdayISO)

  if (!shifts || shifts.length === 0) continue

  const rosterSecsByUser = new Map<string, number>()
  for (const s of shifts) {
    const secs = shiftSeconds(s.start_time, s.end_time)
    if (secs > 0) {
      rosterSecsByUser.set(s.user_id, (rosterSecsByUser.get(s.user_id) ?? 0) + secs)
    }
  }

  // Fetch additional hours (time_entries) for the same week
  const userIds = [...rosterSecsByUser.keys()]
  const { data: entries } = await service
    .from('time_entries')
    .select('user_id, duration_seconds')
    .in('user_id', userIds)
    .gte('started_at', `${weekStart}T00:00:00`)
    .lt('started_at', `${todayISO}T00:00:00`)
    .not('ended_at', 'is', null)

  const entrySecsByUser = new Map<string, number>()
  for (const e of entries ?? []) {
    entrySecsByUser.set(e.user_id, (entrySecsByUser.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0))
  }

  for (const [userId, rosterSeconds] of rosterSecsByUser) {
    const totalSeconds = rosterSeconds + (entrySecsByUser.get(userId) ?? 0)

    const { data: existing } = await service
      .from('timesheets')
      .select('id, status')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (existing?.status === 'approved') {
      timesheetsSkipped++
      continue
    }

    const { error } = await service.from('timesheets').upsert({
      user_id: userId,
      org_id: org.id,
      week_start: weekStart,
      status: 'submitted',
      total_seconds: totalSeconds,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    }, { onConflict: 'user_id,week_start' })

    if (!error) timesheetsCreated++
  }

  orgsProcessed++
}
```

- [ ] **Step 3: Run build**

```
pnpm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```
git add src/app/api/timesheets/generate-weekly/route.ts
git commit -m "fix: include additional time entries in weekly timesheet total"
```

---

### Task 2: GET /api/timesheets/[timesheetId]/detail

**Files:**
- Create: `src/app/api/timesheets/[timesheetId]/detail/route.ts`

**Interfaces:**
- Consumes: Supabase `timesheets`, `roster_shifts`, `time_entries`, `organisation_members`, `projects` tables
- Produces:
```ts
{
  timesheet: { id: string; user_id: string; week_start: string; total_seconds: number; status: string }
  profile: { full_name: string | null; email: string }
  roster_shifts: Array<{ date: string; start_time: string; end_time: string; duration_seconds: number }>
  additional_entries: Array<{ id: string; started_at: string; ended_at: string; duration_seconds: number; project_name: string | null; description: string | null }>
  rostered_seconds: number
  additional_seconds: number
  overtime_seconds: number
}
```

- [ ] **Step 1: Create the route file**

Create `src/app/api/timesheets/[timesheetId]/detail/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

function shiftSeconds(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ timesheetId: string }> }
) {
  const { timesheetId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Fetch timesheet
  const { data: ts } = await service
    .from('timesheets')
    .select('id, user_id, org_id, week_start, total_seconds, status')
    .eq('id', timesheetId)
    .maybeSingle()

  if (!ts) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const t = ts as unknown as {
    id: string; user_id: string; org_id: string
    week_start: string; total_seconds: number; status: string
  }

  // Verify caller is a manager in the same org
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', t.org_id)
    .maybeSingle()

  const role = (membership as unknown as { role: string } | null)?.role
  if (!role || !['owner', 'admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch employee profile
  const { data: profileData } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', t.user_id)
    .maybeSingle()

  const profile = profileData as unknown as { full_name: string | null; email: string } | null

  // Week bounds
  const weekStart = t.week_start
  const weekEndDate = new Date(weekStart + 'T12:00:00Z')
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)

  // Fetch roster shifts
  const { data: shiftsData } = await service
    .from('roster_shifts')
    .select('date, start_time, end_time')
    .eq('user_id', t.user_id)
    .eq('published', true)
    .is('deleted_at', null)
    .gte('date', weekStart)
    .lt('date', weekEnd)
    .order('date')

  const rosterShifts = (shiftsData ?? []).map(s => {
    const sh = s as unknown as { date: string; start_time: string; end_time: string }
    return { date: sh.date, start_time: sh.start_time, end_time: sh.end_time, duration_seconds: shiftSeconds(sh.start_time, sh.end_time) }
  })

  const rosteredSeconds = rosterShifts.reduce((sum, s) => sum + s.duration_seconds, 0)

  // Fetch additional time entries
  const { data: entriesData } = await service
    .from('time_entries')
    .select('id, started_at, ended_at, duration_seconds, description, project_id, projects(name)')
    .eq('user_id', t.user_id)
    .gte('started_at', `${weekStart}T00:00:00`)
    .lt('started_at', `${weekEnd}T00:00:00`)
    .not('ended_at', 'is', null)
    .order('started_at')

  const additionalEntries = (entriesData ?? []).map(e => {
    const en = e as unknown as {
      id: string; started_at: string; ended_at: string
      duration_seconds: number; description: string | null
      project_id: string | null; projects: { name: string } | null
    }
    return {
      id: en.id,
      started_at: en.started_at,
      ended_at: en.ended_at,
      duration_seconds: en.duration_seconds ?? 0,
      project_name: en.projects?.name ?? null,
      description: en.description,
    }
  })

  const additionalSeconds = additionalEntries.reduce((sum, e) => sum + e.duration_seconds, 0)
  const totalSeconds = rosteredSeconds + additionalSeconds
  const overtimeSeconds = Math.max(0, totalSeconds - 136800) // 38h threshold

  return NextResponse.json({
    timesheet: { id: t.id, user_id: t.user_id, week_start: t.week_start, total_seconds: t.total_seconds, status: t.status },
    profile: { full_name: profile?.full_name ?? null, email: profile?.email ?? '' },
    roster_shifts: rosterShifts,
    additional_entries: additionalEntries,
    rostered_seconds: rosteredSeconds,
    additional_seconds: additionalSeconds,
    overtime_seconds: overtimeSeconds,
  })
}
```

- [ ] **Step 2: Run build**

```
pnpm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```
git add src/app/api/timesheets/[timesheetId]/detail/route.ts
git commit -m "feat: GET /api/timesheets/[id]/detail — shifts, additional entries, overtime"
```

---

### Task 3: AdditionalHoursPanel + time page plan gate

**Files:**
- Create: `src/components/time/AdditionalHoursPanel.tsx`
- Modify: `src/components/time/TimeSection.tsx`
- Modify: `src/app/dashboard/time/page.tsx`

**Interfaces:**
- Consumes: Supabase browser client; `projects` table (active); `time_entries` table
- Produces: `<AdditionalHoursPanel>` rendered instead of TimerWidget + ManualEntryForm for Business plan members

- [ ] **Step 1: Create AdditionalHoursPanel.tsx**

Create `src/components/time/AdditionalHoursPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Project = { id: string; name: string }
type Entry = {
  id: string
  started_at: string
  ended_at: string
  duration_seconds: number | null
  description: string | null
  projects: { name: string } | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function AdditionalHoursPanel() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [todayEntries, setTodayEntries] = useState<Entry[]>([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      supabase
        .from('projects')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .then(({ data }) => setProjects(data ?? []))

      supabase
        .from('time_entries')
        .select('id, started_at, ended_at, duration_seconds, description, projects(name)')
        .eq('user_id', user.id)
        .gte('started_at', todayStart.toISOString())
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .then(({ data }) => setTodayEntries((data ?? []) as unknown as Entry[]))
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!projectId) { setError('Please select a project.'); return }
    if (!startTime || !endTime) { setError('Please enter start and end times.'); return }

    const startedAt = new Date(`${date}T${startTime}`)
    const endedAt = new Date(`${date}T${endTime}`)
    if (endedAt <= startedAt) { setError('End time must be after start time.'); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data: newEntry, error: insertError } = await supabase
      .from('time_entries')
      .insert({
        user_id: user.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        project_id: projectId,
        billable: true,
        description: description.trim() || null,
      })
      .select('id, started_at, ended_at, duration_seconds, description, projects(name)')
      .single()

    setSaving(false)
    if (insertError) { setError(insertError.message); return }

    setTodayEntries(prev => [newEntry as unknown as Entry, ...prev])
    setStartTime('')
    setEndTime('')
    setDescription('')
    router.refresh()
  }

  async function deleteEntry(id: string) {
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', id)
    setTodayEntries(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Log additional hours</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
              Project <span className="text-red-500">*</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            >
              <option value="">— Select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">From</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">To</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving || !projectId}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Logging…' : 'Log hours'}
          </button>
        </form>
      </div>

      {todayEntries.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Today&apos;s additional hours</p>
          <div className="space-y-2">
            {todayEntries.map(e => {
              const proj = (e.projects as unknown as { name: string } | null)?.name
              return (
                <div key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{proj ?? '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {fmt(e.started_at)}–{fmt(e.ended_at)}
                      {e.duration_seconds ? ` · ${fmtDuration(e.duration_seconds)}` : ''}
                      {e.description ? ` · ${e.description}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update TimeSection to accept and use rosterManaged**

Replace the entire contents of `src/components/time/TimeSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import TimerWidget from './TimerWidget'
import ManualEntryForm from './ManualEntryForm'
import TimeEntryList from './TimeEntryList'
import AdditionalHoursPanel from './AdditionalHoursPanel'

type TimeEntry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  task_id: string | null
  tasks: { title: string } | null
}

type ActiveEntry = {
  id: string
  started_at: string
  ended_at: string | null
  description: string | null
  task_id: string | null
  project_id: string | null
}

export default function TimeSection({
  userId,
  initialEntries,
  activeEntry,
  rosterManaged = false,
}: {
  userId: string
  initialEntries: TimeEntry[]
  activeEntry: ActiveEntry | null
  rosterManaged?: boolean
}) {
  const [entries, setEntries] = useState(initialEntries)

  function handleAdd(entry: TimeEntry) {
    setEntries(prev => [entry, ...prev])
  }

  if (rosterManaged) {
    return <AdditionalHoursPanel />
  }

  return (
    <>
      <TimerWidget activeEntry={activeEntry} onEntryCompleted={handleAdd} />
      <ManualEntryForm onAdd={handleAdd} />
      <TimeEntryList initialEntries={entries} userId={userId} />
    </>
  )
}
```

- [ ] **Step 3: Pass rosterManaged to TimeSection in time/page.tsx**

In `src/app/dashboard/time/page.tsx`, find the `<TimeSection ... />` line and add the prop:

```tsx
<TimeSection
  activeEntry={activeEntry}
  initialEntries={todayEntries ?? []}
  userId={user.id}
  rosterManaged={isTeamPlan(subscription) && !!orgId}
/>
```

- [ ] **Step 4: Run build**

```
pnpm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```
git add src/components/time/AdditionalHoursPanel.tsx src/components/time/TimeSection.tsx src/app/dashboard/time/page.tsx
git commit -m "feat: AdditionalHoursPanel replaces TimerWidget for Business plan members"
```

---

### Task 4: Roster grid — orange additional hours blocks

**Files:**
- Modify: `src/app/dashboard/roster/page.tsx`
- Modify: `src/components/roster/RosterGrid.tsx`

**Interfaces:**
- Consumes: `time_entries` with `project_id` + `projects(name)` for the roster date range
- Produces: `AdditionalEntry` blocks rendered in orange below shift blocks in each day cell

- [ ] **Step 1: Fetch additional entries in roster/page.tsx**

In `src/app/dashboard/roster/page.tsx`, find the `Promise.all` block that fetches shifts, leave, and orgSettings. Add a fourth query for time entries:

```ts
const [{ data: shifts }, { data: leaveData }, { data: orgSettings }, { data: additionalData }] = await Promise.all([
  supabase
    .from('roster_shifts').select('id, org_id, user_id, date, start_time, end_time, notes, published')
    .eq('org_id', orgId).is('deleted_at', null)
    .gte('date', fromISO).lte('date', toISO),
  supabase
    .from('leave_requests').select('id, user_id, leave_type, start_date, end_date, half_day')
    .eq('org_id', orgId).eq('status', 'approved')
    .lte('start_date', toISO)
    .gte('end_date', fromISO),
  supabase
    .from('organisations').select('pay_week_start_day')
    .eq('id', orgId).maybeSingle(),
  supabase
    .from('time_entries')
    .select('id, user_id, started_at, ended_at, duration_seconds, description, projects(name)')
    .in('user_id', memberListRaw.map(m => m.user_id))
    .gte('started_at', `${fromISO}T00:00:00`)
    .lte('started_at', `${toISO}T23:59:59`)
    .not('ended_at', 'is', null),
])
```

Then pass it to `<RosterGrid>`:

```tsx
<RosterGrid
  orgId={orgId}
  members={memberList}
  initialShifts={shifts ?? []}
  leaveBlocks={leaveData ?? []}
  canManageRoster={canManageRoster}
  weekStartDay={orgSettings?.pay_week_start_day ?? 1}
  currentUserId={user.id}
  initialAdditionalEntries={(additionalData ?? []) as unknown as AdditionalEntry[]}
/>
```

Add the `AdditionalEntry` type export at the top of `page.tsx` (above the default export):

```ts
export type AdditionalEntry = {
  id: string
  user_id: string
  started_at: string
  ended_at: string
  duration_seconds: number | null
  description: string | null
  projects: { name: string } | null
}
```

- [ ] **Step 2: Update RosterGrid to accept and render additional entries**

At the top of `src/components/roster/RosterGrid.tsx`, add the import:

```ts
import type { AdditionalEntry } from '@/app/dashboard/roster/page'
```

Update the component props type (the `export default function RosterGrid(...)` signature) to add `initialAdditionalEntries`:

```ts
export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster, weekStartDay, currentUserId, initialAdditionalEntries = [] }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean; weekStartDay: number
  currentUserId: string; initialAdditionalEntries?: AdditionalEntry[]
})
```

Add state for additional entries after the existing `const [shifts, setShifts] = useState(...)` line:

```ts
const [additionalEntries, setAdditionalEntries] = useState<AdditionalEntry[]>(initialAdditionalEntries)
```

Add a helper function to format duration (after `toISO`):

```ts
function fmtDur(sec: number | null) {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
```

Add a `useEffect` to refetch additional entries when the week navigates (add after the existing state declarations):

```ts
useEffect(() => {
  const supabase = (await import('@/lib/supabase-browser')).createClient()
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  ;(async () => {
    const from = `${weekStart}T00:00:00`
    const to = `${weekEnd}T23:59:59`
    const userIds = members.map(m => m.user_id)
    const { data } = await supabase
      .from('time_entries')
      .select('id, user_id, started_at, ended_at, duration_seconds, description, projects(name)')
      .in('user_id', userIds)
      .gte('started_at', from)
      .lte('started_at', to)
      .not('ended_at', 'is', null)
    setAdditionalEntries((data ?? []) as unknown as AdditionalEntry[])
  })()
}, [weekStart, weekEnd, members])
```

In the day cell rendering (inside `{weekDates.map((d, i) => {`), after the `{dayShifts.map(...)}` block and before the "+ Add shift" button, add the additional entries block:

```tsx
{(() => {
  const dayEntries = additionalEntries.filter(e => {
    const entryDate = new Date(e.started_at).toISOString().split('T')[0]
    return e.user_id === member.user_id && entryDate === iso
  })
  return dayEntries.map(e => {
    const proj = (e.projects as unknown as { name: string } | null)?.name
    const dur = fmtDur(e.duration_seconds)
    return (
      <div
        key={e.id}
        className="mb-1 w-full rounded-lg px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
        title={e.description ?? undefined}
      >
        {proj ?? 'Additional'}{dur ? ` · ${dur}` : ''}
      </div>
    )
  })
})()}
```

- [ ] **Step 3: Run build**

```
pnpm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```
git add src/app/dashboard/roster/page.tsx src/components/roster/RosterGrid.tsx
git commit -m "feat: show additional hours as orange blocks on roster grid"
```

---

### Task 5: TimesheetDetailModal + clickable ManagerTimesheetView rows

**Files:**
- Create: `src/components/time/TimesheetDetailModal.tsx`
- Modify: `src/components/time/ManagerTimesheetView.tsx`

**Interfaces:**
- Consumes: `GET /api/timesheets/[timesheetId]/detail` (Task 2)
- Produces: clickable timesheet rows that open a modal with full breakdown + approve/reject

- [ ] **Step 1: Create TimesheetDetailModal.tsx**

Create `src/components/time/TimesheetDetailModal.tsx`:

```tsx
'use client'

import { X, AlertTriangle } from 'lucide-react'

type RosterShift = {
  date: string
  start_time: string
  end_time: string
  duration_seconds: number
}

type AdditionalEntry = {
  id: string
  started_at: string
  ended_at: string
  duration_seconds: number
  project_name: string | null
  description: string | null
}

type DetailData = {
  timesheet: { id: string; week_start: string; total_seconds: number; status: string }
  profile: { full_name: string | null; email: string }
  roster_shifts: RosterShift[]
  additional_entries: AdditionalEntry[]
  rostered_seconds: number
  additional_seconds: number
  overtime_seconds: number
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function TimesheetDetailModal({
  data,
  onClose,
  onReview,
  savingId,
}: {
  data: DetailData
  onClose: () => void
  onReview: (id: string, status: 'approved' | 'rejected', note?: string) => Promise<void>
  savingId: string | null
}) {
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const { timesheet, profile, roster_shifts, additional_entries, rostered_seconds, additional_seconds, overtime_seconds } = data
  const name = profile.full_name || profile.email
  const weekLabel = new Date(`${timesheet.week_start}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

  async function handleApprove() {
    await onReview(timesheet.id, 'approved')
    onClose()
  }

  async function handleReject() {
    if (!rejectNote.trim()) return
    await onReview(timesheet.id, 'rejected', rejectNote.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Week of {weekLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Roster shifts */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Rostered shifts</p>
            {roster_shifts.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No published shifts this week</p>
            ) : (
              <div className="space-y-1.5">
                {roster_shifts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{fmtDate(s.date)}</span>
                    <span className="text-slate-500 dark:text-slate-400">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">{fmtDuration(s.duration_seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional hours */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Additional hours</p>
            {additional_entries.length === 0 ? (
              <p className="text-sm text-slate-400 italic">None logged</p>
            ) : (
              <div className="space-y-1.5">
                {additional_entries.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{fmtDate(e.started_at.slice(0, 10))}</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                      {e.project_name ?? '—'}{e.description ? ` · ${e.description}` : ''}
                    </span>
                    <span className="font-semibold text-orange-700 dark:text-orange-300 w-12 text-right">{fmtDuration(e.duration_seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Rostered</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtDuration(rostered_seconds)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Additional</span>
              <span className="font-semibold text-orange-700 dark:text-orange-300">{fmtDuration(additional_seconds)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
              <span className="font-bold text-slate-700 dark:text-slate-300">Total</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{fmtDuration(rostered_seconds + additional_seconds)}</span>
            </div>
            {overtime_seconds > 0 && (
              <div className="flex items-center gap-2 pt-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="text-xs font-semibold">{fmtDuration(overtime_seconds)} overtime this week</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {timesheet.status === 'submitted' && (
            <div className="space-y-3">
              {rejectMode ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Reason for rejection"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectMode(false)}
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={!rejectNote.trim() || savingId === timesheet.id}
                      className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setRejectMode(true)}
                    disabled={savingId === timesheet.id}
                    className="flex-1 rounded-xl border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={savingId === timesheet.id}
                    className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {savingId === timesheet.id ? 'Saving…' : '✓ Approve'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

Note: `useState` is used in this component — add `import { useState } from 'react'` at the top of the file alongside the other imports.

The full import block for this file:

```tsx
'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
```

- [ ] **Step 2: Update ManagerTimesheetView to open the modal on row click**

Replace the entire contents of `src/components/time/ManagerTimesheetView.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import TimesheetDetailModal from './TimesheetDetailModal'

type Timesheet = {
  id: string
  week_start: string
  total_seconds: number
  profiles: { email: string; full_name: string | null } | null
}

type DetailData = {
  timesheet: { id: string; week_start: string; total_seconds: number; status: string }
  profile: { full_name: string | null; email: string }
  roster_shifts: Array<{ date: string; start_time: string; end_time: string; duration_seconds: number }>
  additional_entries: Array<{ id: string; started_at: string; ended_at: string; duration_seconds: number; project_name: string | null; description: string | null }>
  rostered_seconds: number
  additional_seconds: number
  overtime_seconds: number
}

function notifyTimesheetReview(id: string) {
  fetch('/api/notifications/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'timesheet', id }),
  }).catch(error => console.error('Timesheet notification failed', error))
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatWeek(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManagerTimesheetView({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadTimesheets = useCallback(async function loadTimesheets() {
    const supabase = createClient()
    const { data } = await supabase
      .from('timesheets')
      .select('id, week_start, total_seconds, profiles!timesheets_user_id_fkey(email, full_name)')
      .eq('org_id', orgId)
      .eq('status', 'submitted')
      .order('week_start', { ascending: false })

    setTimesheets((data ?? []) as unknown as Timesheet[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadTimesheets()
  }, [loadTimesheets])

  async function openDetail(timesheetId: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/timesheets/${timesheetId}/detail`)
      if (res.ok) {
        const data = await res.json() as DetailData
        setSelectedDetail(data)
      }
    } finally {
      setLoadingDetail(false)
    }
  }

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected', note?: string) {
    setSavingId(id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingId(null); return }

    const { error } = await supabase
      .from('timesheets')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: status === 'rejected' ? (note ?? null) : null,
      })
      .eq('id', id)

    if (!error) {
      notifyTimesheetReview(id)
      setTimesheets(prev => prev.filter(ts => ts.id !== id))
      router.refresh()
    }
    setSavingId(null)
  }

  return (
    <>
      {selectedDetail && (
        <TimesheetDetailModal
          data={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onReview={reviewTimesheet}
          savingId={savingId}
        />
      )}
      <div className="rounded-2xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-slate-100">Timesheet approvals</h2>
        {loading ? (
          <p className="text-sm font-semibold text-gray-500">Loading...</p>
        ) : timesheets.length === 0 ? (
          <p className="text-sm font-semibold text-gray-500">No timesheets pending approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-500">
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Week</th>
                  <th className="py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {timesheets.map(timesheet => {
                  const name = timesheet.profiles?.full_name || timesheet.profiles?.email || 'Unknown'
                  return (
                    <tr
                      key={timesheet.id}
                      onClick={() => openDetail(timesheet.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-4 pr-4 font-semibold text-gray-900 dark:text-slate-100">{name}</td>
                      <td className="py-4 pr-4 font-medium text-gray-500 dark:text-slate-400">{formatWeek(timesheet.week_start)}</td>
                      <td className="py-4 font-bold text-slate-900 dark:text-slate-100">
                        {loadingDetail ? '…' : formatDuration(timesheet.total_seconds)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">Click a row to review before approving</p>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run build**

```
pnpm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```
git add src/components/time/TimesheetDetailModal.tsx src/components/time/ManagerTimesheetView.tsx
git commit -m "feat: timesheet approval detail modal with roster breakdown and overtime flag"
```

---

## Final step: push to production

```
git push
```

Verify on Vercel that the deploy goes green, then smoke test:
1. As a Business-plan member — confirm AdditionalHoursPanel appears (no TimerWidget)
2. Log additional hours → verify orange block appears on roster
3. As a manager — click a submitted timesheet row → modal opens with shift list, additional entries, summary
4. Approve and reject from the modal
5. If `total > 38h`, confirm amber overtime warning appears
