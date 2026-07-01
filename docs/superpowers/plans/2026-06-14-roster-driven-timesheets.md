# Roster-Driven Timesheets + Recurring Roster â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published roster the authoritative source of weekly pay hours for Business-plan orgs â€” timesheets auto-generate at week-end with no employee action; recurring shift templates remove weekly manual data entry; week boundaries are org-configurable.

**Architecture:** Three DB migrations (roster_shift_templates table, pay_week_start_day org column + drop Monday-only timesheet constraint, nightly pg_cron jobs). Two nightly GET API routes called by cron (generate shifts from templates; auto-submit timesheets). One POST API route for the "Set as recurring" button. Existing payroll route updated to respect the org's configured week start. Roster grid and Time page updated to anchor weeks to the org's configured day.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (postgres + RLS), pnpm. Verification gate: `pnpm run build`.

**Division of labour (handover loop):**
- **Codex** â€” all `.ts`/`.tsx`/`.sql` file creation and edits.
- **Conductor** â€” runs `pnpm run build`, applies migrations via Supabase MCP `apply_migration`, commits. Steps marked `[CONDUCTOR]` must NOT be executed by Codex.

---

## Task 1 â€” schema-050: roster_shift_templates

**Files:**
- Create: `supabase/schema-051-roster-templates.sql`

- [ ] **Step C1-1 (Codex): Create migration file**

Create `supabase/schema-051-roster-templates.sql` with exactly this content:

```sql
-- ============================================================
-- TimeWiseHub â€” Schema 051: Roster shift templates
-- ============================================================

create table public.roster_shift_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0=Sun,1=Monâ€¦6=Sat (JS getUTCDay())
  start_time   time not null,
  end_time     time not null,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id, day_of_week)
);

alter table public.roster_shift_templates enable row level security;

create policy "employees read own templates"
  on public.roster_shift_templates for select
  using (user_id = auth.uid());

create policy "managers read org templates"
  on public.roster_shift_templates for select
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

create policy "admins manage templates"
  on public.roster_shift_templates for all
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create index roster_templates_org on public.roster_shift_templates (org_id, user_id);
```

- [ ] **Step C1-2 [CONDUCTOR]: Apply migration + commit**

```
apply_migration(name="schema-051-roster-templates", query=<file contents>)
pnpm run build
git add supabase/schema-051-roster-templates.sql
git commit -m "feat: add roster_shift_templates table (schema-050)"
```

---

## Task 2 â€” schema-051: pay_week_start_day + drop Monday constraint

**Files:**
- Create: `supabase/schema-052-pay-week-start.sql`

- [ ] **Step C2-1 (Codex): Create migration file**

Create `supabase/schema-052-pay-week-start.sql`:

```sql
-- ============================================================
-- TimeWiseHub â€” Schema 052: Configurable pay-week start day
-- ============================================================

-- 0=Sun, 1=Mon(default), 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
alter table public.organisations
  add column pay_week_start_day smallint not null default 1
    check (pay_week_start_day between 0 and 6);

-- Drop the Monday-only constraint on timesheets.week_start.
-- Existing rows are all Mondays so no rows are invalidated.
-- The constraint was auto-named from the inline check in schema-020.
alter table public.timesheets
  drop constraint if exists timesheets_week_start_check;
```

- [ ] **Step C2-2 [CONDUCTOR]: Verify constraint name + apply + commit**

Before applying, run in Supabase SQL editor:
```sql
select constraint_name
from information_schema.table_constraints
where table_name = 'timesheets' and constraint_type = 'CHECK';
```
Expected: `timesheets_week_start_check`. If the name differs, update the migration file before applying.

```
apply_migration(name="schema-052-pay-week-start", query=<file contents>)
pnpm run build
git add supabase/schema-052-pay-week-start.sql
git commit -m "feat: add pay_week_start_day to orgs, drop Monday-only timesheet constraint (schema-051)"
```

---

## Task 3 â€” Update `derivePayPeriod()` to respect week start day

**Files:**
- Modify: `src/lib/payroll/period.ts`

Current file (`src/lib/payroll/period.ts`):
```ts
export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/** ISO date (YYYY-MM-DD) â†’ period boundaries. UTC math avoids TZ drift. */
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${anchorISO}T00:00:00Z`)

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { periodStart: iso(start), periodEnd: iso(end) }
  }

  const day = d.getUTCDay() // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - mondayOffset)
  const span = cadence === 'weekly' ? 6 : 13
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + span)
  return { periodStart: iso(start), periodEnd: iso(end) }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step C3-1 (Codex): Replace `src/lib/payroll/period.ts`**

Replace the entire file with:

```ts
export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/**
 * ISO date (YYYY-MM-DD) â†’ period boundaries. UTC math avoids TZ drift.
 * weekStartDay: 0=Sun, 1=Mon â€¦ 6=Sat (JS getUTCDay() convention). Default 1 (Monday).
 * All existing callers omit weekStartDay and continue to get Monday-anchored periods.
 */
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
  weekStartDay = 1,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${anchorISO}T00:00:00Z`)

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { periodStart: iso(start), periodEnd: iso(end) }
  }

  const day = d.getUTCDay() // 0=Sun..6=Sat
  const offset = (day - weekStartDay + 7) % 7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - offset)
  const span = cadence === 'weekly' ? 6 : 13
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + span)
  return { periodStart: iso(start), periodEnd: iso(end) }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

---

## Task 4 â€” Update pay-runs route to pass `pay_week_start_day`

**Files:**
- Modify: `src/app/api/pay-runs/route.ts`

- [ ] **Step C4-1 (Codex): Add `pay_week_start_day` to org select and pass to `derivePayPeriod`**

In `src/app/api/pay-runs/route.ts`, change the org select (currently line 22â€“26):

```ts
  const { data: org } = await supabase
    .from('organisations')
    .select('pay_cadence, super_rate')
    .eq('id', ctx.orgId)
    .single()
```

Replace with:

```ts
  const { data: org } = await supabase
    .from('organisations')
    .select('pay_cadence, super_rate, pay_week_start_day')
    .eq('id', ctx.orgId)
    .single()
```

Then change the `derivePayPeriod` call (currently line 31):

```ts
  const { periodStart, periodEnd } = derivePayPeriod(cadence, anchor)
```

Replace with:

```ts
  const weekStartDay = typeof org.pay_week_start_day === 'number' ? org.pay_week_start_day : 1
  const { periodStart, periodEnd } = derivePayPeriod(cadence, anchor, weekStartDay)
```

---

## Task 5 â€” `TimesheetSection`: hide submit for roster-managed members

**Files:**
- Modify: `src/components/time/TimesheetSection.tsx`

- [ ] **Step C5-1 (Codex): Add `rosterManaged` prop and conditional render**

In `src/components/time/TimesheetSection.tsx`, update the props destructuring and type (currently starting at line 42):

```ts
export default function TimesheetSection({
  userId,
  orgId,
  weekStart,
  totalSeconds,
  initialTimesheet,
}: {
  userId: string
  orgId: string | null
  weekStart: string
  totalSeconds: number
  initialTimesheet: Timesheet | null
}) {
```

Replace with:

```ts
export default function TimesheetSection({
  userId,
  orgId,
  weekStart,
  totalSeconds,
  initialTimesheet,
  rosterManaged,
}: {
  userId: string
  orgId: string | null
  weekStart: string
  totalSeconds: number
  initialTimesheet: Timesheet | null
  rosterManaged: boolean
}) {
```

Then replace the submit button at the bottom of the component (currently lines 107â€“114):

```tsx
        <button
          type="button"
          onClick={submitTimesheet}
          disabled={disabled}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : status === 'rejected' ? 'Resubmit for approval' : 'Submit for approval'}
        </button>
```

Replace with:

```tsx
        {rosterManaged ? (
          <p className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700">
            Your timesheet is submitted automatically from your roster.
          </p>
        ) : (
          <button
            type="button"
            onClick={submitTimesheet}
            disabled={disabled}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : status === 'rejected' ? 'Resubmit for approval' : 'Submit for approval'}
          </button>
        )}
```

---

## Task 6 â€” `RosterGrid`: week anchor respects `weekStartDay`

**Files:**
- Modify: `src/components/roster/RosterGrid.tsx`

- [ ] **Step C6-1 (Codex): Update `getWeekDates`, component props, and internal usages**

In `src/components/roster/RosterGrid.tsx`:

**1.** Replace the `getWeekDates` function (currently lines 34â€“39):

```ts
function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay()
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
}
```

Replace with:

```ts
function getWeekDates(anchor: Date, weekStartDay: number): Date[] {
  const day = anchor.getDay()
  const start = new Date(anchor)
  const offset = (day - weekStartDay + 7) % 7
  start.setDate(anchor.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}
```

**2.** Update the component signature (currently line 42):

```ts
export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean
}) {
```

Replace with:

```ts
export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster, weekStartDay }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean; weekStartDay: number
}) {
```

**3.** Update the `getWeekDates` call (currently line 52):

```ts
  const weekDates = getWeekDates(weekAnchor)
```

Replace with:

```ts
  const weekDates = getWeekDates(weekAnchor, weekStartDay)
```

---

## Task 7 â€” `RosterGrid`: "Set as recurring" button

**Files:**
- Modify: `src/components/roster/RosterGrid.tsx`

- [ ] **Step C7-1 (Codex): Add state + `setAsRecurring` function + button**

In `src/components/roster/RosterGrid.tsx`:

**1.** Add state for the template-saving flag alongside the existing `publishing` state (currently line 51):

```ts
  const [publishing, setPublishing] = useState(false)
```

Replace with:

```ts
  const [publishing, setPublishing] = useState(false)
  const [settingTemplate, setSettingTemplate] = useState(false)
```

**2.** Add the `setAsRecurring` function after the `publishWeek` function (after line 71, before the `unpublishedCount` line):

```ts
  async function setAsRecurring() {
    setSettingTemplate(true)
    const weekShifts = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd)
    const templateShifts = weekShifts.map(s => ({
      userId: s.user_id,
      dayOfWeek: new Date(s.date + 'T12:00:00Z').getUTCDay(),
      startTime: s.start_time,
      endTime: s.end_time,
      notes: s.notes,
    }))
    await fetch('/api/roster/set-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, shifts: templateShifts }),
    })
    setSettingTemplate(false)
  }
```

**3.** Add the "Set as recurring" button in the header div, after the existing Publish button (currently after line 91):

```tsx
        {canManageRoster && (
          <button onClick={setAsRecurring} disabled={settingTemplate}
            className="rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20">
            {settingTemplate ? 'Savingâ€¦' : 'Set as recurring'}
          </button>
        )}
```

Place this button immediately after the closing `}` of the existing `{canManageRoster && unpublishedCount > 0 && (...)}` block.

---

## Task 8 â€” `roster/page.tsx`: fetch and pass `pay_week_start_day`

**Files:**
- Modify: `src/app/dashboard/roster/page.tsx`

- [ ] **Step C8-1 (Codex): Add org settings fetch and pass weekStartDay prop**

In `src/app/dashboard/roster/page.tsx`:

**1.** Extend the parallel Promise.all to also fetch the org's `pay_week_start_day`. The current fetch (lines 57â€“67) is:

```ts
  const [{ data: shifts }, { data: leaveData }] = await Promise.all([
    supabase
      .from('roster_shifts').select('id, org_id, user_id, date, start_time, end_time, notes, published')
      .eq('org_id', orgId).is('deleted_at', null)
      .gte('date', fromISO).lte('date', toISO),
    supabase
      .from('leave_requests').select('id, user_id, leave_type, start_date, end_date, half_day')
      .eq('org_id', orgId).eq('status', 'approved')
      .lte('start_date', toISO)
      .gte('end_date', fromISO),
  ])
```

Replace with:

```ts
  const [{ data: shifts }, { data: leaveData }, { data: orgSettings }] = await Promise.all([
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
  ])
```

**2.** Update the `RosterGrid` usage (currently lines 73â€“79) to pass the new prop:

```tsx
        <RosterGrid
          orgId={orgId}
          members={memberList}
          initialShifts={shifts ?? []}
          leaveBlocks={leaveData ?? []}
          canManageRoster={canManageRoster}
        />
```

Replace with:

```tsx
        <RosterGrid
          orgId={orgId}
          members={memberList}
          initialShifts={shifts ?? []}
          leaveBlocks={leaveData ?? []}
          canManageRoster={canManageRoster}
          weekStartDay={orgSettings?.pay_week_start_day ?? 1}
        />
```

---

## Task 9 â€” `time/page.tsx`: `getWeekStartStr` + `pay_week_start_day`

**Files:**
- Modify: `src/app/dashboard/time/page.tsx`

- [ ] **Step C9-1 (Codex): Replace `getMondayDateStr` with `getWeekStartStr`, fetch org setting, pass `rosterManaged`**

In `src/app/dashboard/time/page.tsx`, make these three changes:

**1.** Replace the `getMondayDateStr` function (currently lines 26â€“35):

```ts
function getMondayDateStr(timezone: string): string {
  const now = new Date()
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone }) // YYYY-MM-DD
  // Use noon UTC to safely manipulate the date without DST edge cases
  const d = new Date(localDate + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun, 1=Mon â€¦ 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
```

Replace with:

```ts
function getWeekStartStr(timezone: string, weekStartDay: number): string {
  const now = new Date()
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const d = new Date(localDate + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun â€¦ 6=Sat
  const diff = (day - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}
```

**2.** Replace the parallel fetches block in `TimePage` (currently lines 53â€“67). The current block fetches `membership` alongside everything else. Restructure so membership and org settings are resolved first, then compute `weekStartDayStr`, then parallel-fetch the rest:

```ts
  const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
  const timezone = profile?.timezone ?? 'UTC'

  const todayStart = localMidnight(timezone)
  const tz = tzSuffix(timezone)

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()

  const orgId = membership?.org_id ?? null
  let weekStartDay = 1
  if (orgId) {
    const { data: orgSettings } = await supabase
      .from('organisations').select('pay_week_start_day').eq('id', orgId).maybeSingle()
    weekStartDay = orgSettings?.pay_week_start_day ?? 1
  }

  const weekStartDayStr = getWeekStartStr(timezone, weekStartDay)
  const weekEndDay = new Date(weekStartDayStr + 'T12:00:00Z')
  weekEndDay.setUTCDate(weekEndDay.getUTCDate() + 7)
  const weekStart = new Date(`${weekStartDayStr}T00:00:00${tz}`).toISOString()
  const weekEnd = new Date(`${weekEndDay.toISOString().slice(0, 10)}T00:00:00${tz}`).toISOString()

  const [
    { data: todayEntries },
    { data: weekEntries },
    { data: activeEntry },
    { data: timesheet },
    subscription,
  ] = await Promise.all([
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).gte('started_at', todayStart).order('started_at', { ascending: false }),
    supabase.from('time_entries').select('duration_seconds').eq('user_id', user.id).gte('started_at', weekStart).lt('started_at', weekEnd).not('ended_at', 'is', null),
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    supabase.from('timesheets').select('id, status, total_seconds, review_note').eq('user_id', user.id).eq('week_start', weekStartDayStr).maybeSingle(),
    getSubscription(user.id),
  ])
```

This replaces everything from `const { data: profile }` (line 42) through the end of the existing `Promise.all` block (line 67). The `todayStart`, `tz`, `weekStart`, `weekEnd` variables are still computed â€” they are just reordered.

**3.** Update the `TimesheetSection` JSX (currently lines 78â€“84) to pass `rosterManaged`:

```tsx
        <TimesheetSection
          userId={user.id}
          orgId={membership?.org_id ?? null}
          weekStart={weekStartDayStr}
          totalSeconds={weekSeconds}
          initialTimesheet={timesheet ?? null}
        />
```

Replace with:

```tsx
        <TimesheetSection
          userId={user.id}
          orgId={orgId}
          weekStart={weekStartDayStr}
          totalSeconds={weekSeconds}
          initialTimesheet={timesheet ?? null}
          rosterManaged={isTeamPlan(subscription) && !!orgId}
        />
```

Note: `isTeamPlan` is already imported at line 8; `orgId` is now a local const defined above.

Also update the `isManager` check (currently uses `membership?.org_id`). Change `membership?.org_id` to `orgId` in the `isManager && membership?.org_id &&` guard. And update the `ManagerTimeView` and `ManagerTimesheetView` calls to use `orgId` directly.

---

## Task 10 â€” `OrgBillingSettingsForm`: add `pay_week_start_day` field

**Files:**
- Modify: `src/components/OrgBillingSettingsForm.tsx`

- [ ] **Step C10-1 (Codex): Add prop, state, save logic, and dropdown UI**

In `src/components/OrgBillingSettingsForm.tsx`:

**1.** Add `initialPayWeekStartDay: number` to the props type (after `initialSuperRate: number` on line 32):

```ts
  initialSuperRate: number
```

Replace with:

```ts
  initialSuperRate: number
  initialPayWeekStartDay: number
```

**2.** Add `initialPayWeekStartDay` to the destructured props (after `initialSuperRate` in the function params, line 24):

```ts
  initialSuperRate,
```

Replace with:

```ts
  initialSuperRate,
  initialPayWeekStartDay,
```

**3.** Add state for the new field after the `superRate` state line (currently line 41):

```ts
  const [superRate, setSuperRate] = useState(String(initialSuperRate))
```

Replace with:

```ts
  const [superRate, setSuperRate] = useState(String(initialSuperRate))
  const [payWeekStartDay, setPayWeekStartDay] = useState(initialPayWeekStartDay)
```

**4.** Add `pay_week_start_day` to the `handleSave` org update (currently lines 64â€“69, inside the `update({...})` call). Add it after `super_rate`:

```ts
        super_rate: superRate.trim() ? Number(superRate) : 12,
```

Replace with:

```ts
        super_rate: superRate.trim() ? Number(superRate) : 12,
        pay_week_start_day: payWeekStartDay,
```

**5.** Add the dropdown UI. The pay cadence and super rate are in a `grid gap-4 sm:grid-cols-2` div (currently lines 197â€“219). Add the "Pay week starts on" select after that entire `<div className="grid gap-4 sm:grid-cols-2">` block:

```tsx
      <div>
        <label htmlFor="payWeekStartDay" className="block text-sm font-bold text-gray-900">Pay week starts on</label>
        <select
          id="payWeekStartDay" value={payWeekStartDay}
          onChange={e => setPayWeekStartDay(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
          <option value={2}>Tuesday</option>
          <option value={3}>Wednesday</option>
          <option value={4}>Thursday</option>
          <option value={5}>Friday</option>
          <option value={6}>Saturday</option>
        </select>
        <p className="mt-1 text-xs font-medium text-gray-500">Roster weeks and timesheets are anchored to this day.</p>
      </div>
```

---

## Task 11 â€” `settings/page.tsx`: fetch and pass `pay_week_start_day`

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step C11-1 (Codex): Extend org select + pass new prop to form**

**1.** Update the org select query (currently line 36):

```ts
        .select('name, time_rounding_minutes, pay_cadence, super_rate, invoice_letterhead, invoice_payment_details')
```

Replace with:

```ts
        .select('name, time_rounding_minutes, pay_cadence, super_rate, pay_week_start_day, invoice_letterhead, invoice_payment_details')
```

**2.** Add `initialPayWeekStartDay` prop to `OrgBillingSettingsForm` (currently lines 143â€“153). Add after `initialSuperRate`:

```tsx
            initialSuperRate={organisation?.super_rate ?? 12}
```

Replace with:

```tsx
            initialSuperRate={organisation?.super_rate ?? 12}
            initialPayWeekStartDay={organisation?.pay_week_start_day ?? 1}
```

---

## Task 12 â€” [CONDUCTOR] Build check + commit (Tasks 3â€“11)

- [ ] **Step C12-1 [CONDUCTOR]: Run build and commit**

```
pnpm run build
```

Expected: exits 0, no tsc or eslint errors.

```
git add src/lib/payroll/period.ts
git add src/app/api/pay-runs/route.ts
git add src/components/time/TimesheetSection.tsx
git add src/components/roster/RosterGrid.tsx
git add src/app/dashboard/roster/page.tsx
git add src/app/dashboard/time/page.tsx
git add src/components/OrgBillingSettingsForm.tsx
git add src/app/settings/page.tsx
git commit -m "feat: roster week anchoring, rosterManaged flag, recurring button, pay week start setting"
```

---

## Task 13 â€” `POST /api/roster/set-template`

**Files:**
- Create: `src/app/api/roster/set-template/route.ts`

- [ ] **Step C13-1 (Codex): Create the route**

Create `src/app/api/roster/set-template/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, shifts } = await req.json()
  if (!orgId || !Array.isArray(shifts)) {
    return NextResponse.json({ error: 'orgId and shifts required' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!['owner', 'admin'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabase.from('roster_shift_templates').delete().eq('org_id', orgId)

  if (shifts.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const rows = (shifts as { userId: string; dayOfWeek: number; startTime: string; endTime: string; notes: string | null }[]).map(s => ({
    org_id: orgId,
    user_id: s.userId,
    day_of_week: s.dayOfWeek,
    start_time: s.startTime,
    end_time: s.endTime,
    notes: s.notes ?? null,
  }))

  const { error } = await supabase.from('roster_shift_templates').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, count: rows.length })
}
```

---

## Task 14 â€” `GET /api/roster/generate-from-template`

**Files:**
- Create: `src/app/api/roster/generate-from-template/route.ts`

- [ ] **Step C14-1 (Codex): Create the cron route**

Create `src/app/api/roster/generate-from-template/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const todayISO = new Date().toISOString().slice(0, 10)
  const tomorrowISO = addDays(todayISO, 1)
  const tomorrowDow = new Date(tomorrowISO + 'T12:00:00Z').getUTCDay() // 0=Sunâ€¦6=Sat

  const { data: orgs } = await service
    .from('organisations')
    .select('id, pay_week_start_day')
    .eq('pay_week_start_day', tomorrowDow)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, orgsProcessed: 0, shiftsCreated: 0 })
  }

  let orgsProcessed = 0
  let shiftsCreated = 0

  for (const org of orgs) {
    const { data: templates } = await service
      .from('roster_shift_templates')
      .select('user_id, day_of_week, start_time, end_time, notes')
      .eq('org_id', org.id)

    if (!templates || templates.length === 0) continue

    for (const tmpl of templates) {
      const daysOffset = (tmpl.day_of_week - tomorrowDow + 7) % 7
      const shiftDate = addDays(tomorrowISO, daysOffset)

      const { data: existing } = await service
        .from('roster_shifts')
        .select('id')
        .eq('org_id', org.id)
        .eq('user_id', tmpl.user_id)
        .eq('date', shiftDate)
        .eq('start_time', tmpl.start_time)
        .is('deleted_at', null)
        .maybeSingle()

      if (existing) continue

      const { error } = await service.from('roster_shifts').insert({
        org_id: org.id,
        user_id: tmpl.user_id,
        date: shiftDate,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        notes: tmpl.notes ?? null,
        published: true,
      })
      if (!error) shiftsCreated++
    }

    orgsProcessed++
  }

  return NextResponse.json({ ok: true, orgsProcessed, shiftsCreated })
}
```

---

## Task 15 â€” `GET /api/timesheets/generate-weekly`

**Files:**
- Create: `src/app/api/timesheets/generate-weekly/route.ts`

- [ ] **Step C15-1 (Codex): Create the cron route**

Create `src/app/api/timesheets/generate-weekly/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function shiftSeconds(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const todayISO = new Date().toISOString().slice(0, 10)
  const yesterdayISO = addDays(todayISO, -1)
  const yesterdayDow = new Date(yesterdayISO + 'T12:00:00Z').getUTCDay()

  // Week ends on the day before the week start day.
  // e.g. Mon-start (1): week ends Sun (0) â†’ (0+1)%7=1 âœ“
  // e.g. Thu-start (4): week ends Wed (3) â†’ (3+1)%7=4 âœ“
  const weekStartDayFilter = (yesterdayDow + 1) % 7

  const { data: orgs } = await service
    .from('organisations')
    .select('id, pay_week_start_day')
    .eq('pay_week_start_day', weekStartDayFilter)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, orgsProcessed: 0, timesheetsCreated: 0, timesheetsSkipped: 0 })
  }

  let orgsProcessed = 0
  let timesheetsCreated = 0
  let timesheetsSkipped = 0

  for (const org of orgs) {
    const weekStart = addDays(yesterdayISO, -6) // 7-day week; yesterday is day 7

    const { data: shifts } = await service
      .from('roster_shifts')
      .select('user_id, start_time, end_time')
      .eq('org_id', org.id)
      .eq('published', true)
      .is('deleted_at', null)
      .gte('date', weekStart)
      .lte('date', yesterdayISO)

    if (!shifts || shifts.length === 0) continue

    const secondsByUser = new Map<string, number>()
    for (const s of shifts) {
      const secs = shiftSeconds(s.start_time, s.end_time)
      if (secs > 0) {
        secondsByUser.set(s.user_id, (secondsByUser.get(s.user_id) ?? 0) + secs)
      }
    }

    for (const [userId, totalSeconds] of secondsByUser) {
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

  return NextResponse.json({ ok: true, orgsProcessed, timesheetsCreated, timesheetsSkipped })
}
```

---

## Task 16 â€” [CONDUCTOR] Build check + commit (Tasks 13â€“15)

- [ ] **Step C16-1 [CONDUCTOR]: Run build and commit**

```
pnpm run build
```

Expected: exits 0.

```
git add src/app/api/roster/set-template/route.ts
git add src/app/api/roster/generate-from-template/route.ts
git add src/app/api/timesheets/generate-weekly/route.ts
git commit -m "feat: add set-template, generate-from-template, and generate-weekly API routes"
```

---

## Task 17 â€” schema-052: nightly cron jobs

**Files:**
- Create: `supabase/schema-053-roster-cron.sql`

- [ ] **Step C17-1 (Codex): Create migration file**

Create `supabase/schema-053-roster-cron.sql`:

```sql
-- ============================================================
-- TimeWiseHub â€” Schema 053: Nightly roster + timesheet crons
-- ============================================================
-- IMPORTANT (conductor): Before applying this migration, store the
-- CRON_SECRET value in the database so pg_cron can pass it:
--
--   alter database postgres set app.cron_secret = '<your CRON_SECRET value>';
--   select pg_reload_conf();
--
-- The value must match the CRON_SECRET env var set on Vercel.
-- ============================================================

-- Job 1: Generate next week's shifts from recurring templates.
-- Runs at 00:00 UTC nightly. Self-selects orgs whose week starts tomorrow.
select cron.schedule(
  'roster-template-generate-nightly',
  '0 0 * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/roster/generate-from-template',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    )
  )
  $$
);

-- Job 2: Auto-submit timesheets from published roster shifts.
-- Runs at 00:05 UTC nightly (5 min after job 1). Self-selects orgs whose week ended yesterday.
select cron.schedule(
  'roster-timesheet-generate-nightly',
  '5 0 * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/timesheets/generate-weekly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    )
  )
  $$
);
```

- [ ] **Step C17-2 [CONDUCTOR]: Store CRON_SECRET in DB, apply migration, commit**

**Before applying**, run this in the Supabase SQL editor (replace `<secret>` with the actual value from Vercel env vars â€” run `vercel env ls` to see it):

```sql
alter database postgres set app.cron_secret = '<secret>';
select pg_reload_conf();
```

Then apply the migration and commit:

```
apply_migration(name="schema-053-roster-cron", query=<file contents>)
pnpm run build
git add supabase/schema-053-roster-cron.sql
git commit -m "feat: add nightly roster template + timesheet cron jobs (schema-052)"
```

---

## Verification

After all tasks complete, verify:

1. **Build:** `pnpm run build` passes clean (done after every [CONDUCTOR] step).

2. **Constraint dropped:**
   ```sql
   select constraint_name from information_schema.table_constraints
   where table_name = 'timesheets' and constraint_type = 'CHECK';
   ```
   `timesheets_week_start_check` must NOT appear.

3. **Settings smoke:** Log in as org admin â†’ Settings â†’ change "Pay week starts on" to Thursday â†’ Save. Navigate to `/dashboard/roster` â†’ confirm grid shows Thuâ€“Wed. Navigate to `/dashboard/time` â†’ confirm week start shown is a Thursday.

4. **Recurring template smoke:** Create a full week of shifts on the roster â†’ click "Set as recurring" â†’ confirm template rows exist:
   ```sql
   select * from roster_shift_templates where org_id = '<your_org_id>';
   ```

5. **Cron smoke (manual trigger):** Call the routes directly in a browser (unauthenticated requests are allowed in local dev when `CRON_SECRET` is unset):
   - `GET /api/roster/generate-from-template` â†’ `{ ok: true, orgsProcessed: N, shiftsCreated: N }`
   - `GET /api/timesheets/generate-weekly` â†’ `{ ok: true, orgsProcessed: N, timesheetsCreated: N }`

6. **Timesheet smoke:** Confirm a `submitted` timesheet appears in the manager's Timesheet Approvals panel after calling `generate-weekly`. Approve it, then run a pay run â€” confirm `total_seconds` matches the sum of roster shift hours.

7. **Employee view:** Log in as an employee of a Business org â†’ `/dashboard/time` â†’ confirm "Your timesheet is submitted automatically from your roster." message is shown instead of the submit button.
