# Business Timesheet Overhaul — Design Spec
**Date:** 2026-06-29  
**Status:** Approved for implementation

---

## Problem Statement

Business-plan org members currently see the same clock-in/clock-out TimerWidget as Free/Pro users, even though their hours are driven by the roster. This causes:

1. **Double-counting** — clocking in during a rostered shift adds those hours to both the roster total and the time-entry total in the timesheet cron.
2. **No additional-hours path** — there is no way to log overtime or extra work beyond the roster without using the clock-in widget (which conflicts with rostered hours).
3. **No approval detail** — managers can only see a single total-hours figure before approving; they cannot drill into the underlying shifts or extra entries.
4. **No overtime visibility** — nothing flags when an employee's total week exceeds 38 h.

---

## Goals

- Replace the clock-in widget for Business-plan members with a purpose-built **Log Additional Hours** form (project-required, no live timer).
- Show logged additional hours on the **roster grid** as amber blocks stacked beneath scheduled shifts.
- Give managers a **clickable approval detail modal** showing the roster/additional breakdown and an overtime flag.
- Fix the timesheet **cron calculation** so additional hours are no longer double-counted against rostered hours.

---

## Out of Scope

- Automatic overtime rate calculation (time-and-a-half / double-time) — flag only; rate logic is award-dependent and will be tackled in a future payroll spec.
- Google / Outlook calendar sync — separate spec.
- Business onboarding wizard — separate spec (depends on calendar sync).
- Free / Pro users — no changes to their clock-in flow.

---

## Data Layer

No schema migration required. The existing `time_entries` table stores additional-hours entries identically to clock-in entries (`started_at`, `ended_at`, `project_id`, `billable`). The distinction is purely UI: Business-plan members reach this table only through the new Log Additional Hours form (project required, no live timer), not through the TimerWidget.

**Timesheet cron fix (generate-weekly route):**
Currently `src/app/api/timesheets/generate-weekly/route.ts` computes `total_seconds` from roster shifts only, missing any additional hours logged during the week. Fix: after summing `roster_seconds`, also sum `time_entries.duration_seconds` for the same user/week (completed entries only, `ended_at IS NOT NULL`). New total = `roster_seconds + entry_seconds`. This matches what `timesheet-autosubmit` already does — now both crons are consistent.

No double-counting risk going forward: Business members can no longer clock in during shifts (TimerWidget hidden), so all their `time_entries` are by definition additional hours.

---

## Section 1 — Log Additional Hours (replaces TimerWidget for Business)

### Trigger

`rosterManaged = isTeamPlan(subscription) && !!orgId` (already computed in `dashboard/time/page.tsx`). When true: render `<AdditionalHoursPanel>` instead of `<TimeSection>` (which contains TimerWidget + ManualEntryForm + TimeEntryList).

### AdditionalHoursPanel component

**File:** `src/components/time/AdditionalHoursPanel.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Log additional hours                           │
│                                                 │
│  Project *          [dropdown — required]       │
│  Date               [date picker — default today]│
│  From               [time — HH:MM]              │
│  To                 [time — HH:MM]              │
│  Description        [text input — optional]     │
│                                                 │
│                       [Log hours]               │
├─────────────────────────────────────────────────┤
│  Today's additional hours                       │
│  • Design review  09:00–10:30  1h 30m  Acme Co  │
│  • Client call    14:00–15:00  1h      Acme Co  │
└─────────────────────────────────────────────────┘
```

**Behaviour:**
- Project selector is prominent (larger than other fields, labelled with asterisk). Fetches `active` projects for the org. Required — submit disabled if no project selected.
- Date defaults to today. From/To times are required and must be a valid range (To > From).
- On submit: `INSERT INTO time_entries (user_id, started_at, ended_at, project_id, billable, description)` where `started_at = date + from_time`, `ended_at = date + to_time`, `billable = true`.
- Below the form: list of today's completed time_entries for the user (date = today), showing project name, time range, duration. Edit/delete icons. Reuses existing query pattern from TimeEntryList.
- No live timer, no "clock in now" button.

---

## Section 2 — Roster Grid: additional hours as amber blocks

### Trigger

Only rendered for Business-plan orgs (`isTeamPlan`). On Free/Pro the roster doesn't exist.

### Change to RosterGrid

**File:** `src/components/roster/RosterGrid.tsx`

Each day cell currently renders one or more shift blocks. After rendering shifts, also fetch and render any `time_entries` for that day for that user (or all users if in the manager view).

**Visual treatment:**
- Scheduled shift block: existing colour (violet / current).
- Additional hours block: **amber** (`bg-amber-400/20 border-amber-400 text-amber-700 dark:text-amber-300`), stacked below the shift block in the same day cell.
- Content of amber block: project name (truncated) + duration (e.g. "Acme Co · 1h 30m").
- Clicking an amber block opens an edit form (same fields as the Log Additional Hours form, pre-filled).

**Data fetch:**
Add a second query in the RosterGrid data-loading path:
```ts
supabase
  .from('time_entries')
  .select('id, started_at, ended_at, duration_seconds, project_id, description, projects(name)')
  .in('user_id', visibleUserIds)
  .gte('started_at', weekStart)
  .lt('started_at', weekEnd)
  .not('ended_at', 'is', null)
```
Group results by (user_id, date) and render under the appropriate day cell.

---

## Section 3 — Manager timesheet approval detail modal

### Change to ManagerTimesheetView

**File:** `src/components/time/ManagerTimesheetView.tsx`

Make each timesheet row clickable. Clicking opens `<TimesheetDetailModal>`. The existing Approve / Reject buttons move inside the modal (rows no longer have inline action buttons — this removes the mis-click risk of approving without reviewing).

### TimesheetDetailModal component

**File:** `src/components/time/TimesheetDetailModal.tsx`

**Layout:**
```
┌──────────────────────────────────────────────────┐
│  Jane Smith — Week of 23 Jun 2026        [×]    │
├──────────────────────────────────────────────────┤
│  ROSTERED SHIFTS                                 │
│  Mon 23 Jun   09:00 – 17:00   8h                │
│  Tue 24 Jun   09:00 – 17:00   8h                │
│  Wed 25 Jun   09:00 – 17:00   8h                │
│  Thu 26 Jun   09:00 – 17:00   8h                │
│  Fri 27 Jun   09:00 – 17:00   8h                │
├──────────────────────────────────────────────────┤
│  ADDITIONAL HOURS                                │
│  Mon 23 Jun   Acme Co   18:00–19:30   1h 30m    │
│  Thu 26 Jun   Acme Co   17:00–18:00   1h        │
├──────────────────────────────────────────────────┤
│  Rostered: 40h  │  Additional: 2h 30m           │
│  Total: 42h 30m  ⚠ 4h 30m overtime this week   │
├──────────────────────────────────────────────────┤
│  [Reject ▾]                      [✓ Approve]    │
└──────────────────────────────────────────────────┘
```

**Overtime flag:** If `total_seconds > 38 * 3600`, show amber warning row: "⚠ Xh Ym overtime this week". No rate calculation — flagging only.

**Reject flow:** Clicking Reject expands an inline text field for the rejection note, then a Confirm Reject button. Matches existing rejection UX but moved inside the modal.

**API:** On modal open, fetch from a new route:

### New API route: GET /api/timesheets/[timesheetId]/detail

**File:** `src/app/api/timesheets/[timesheetId]/detail/route.ts`

Auth: Supabase session + org membership check (manager role required).

Returns:
```ts
{
  timesheet: { id, user_id, week_start, total_seconds, status },
  profile: { full_name, email },
  roster_shifts: [{ date, start_time, end_time, duration_seconds }],
  additional_entries: [{ id, started_at, ended_at, duration_seconds, project_name, description }],
  rostered_seconds: number,
  additional_seconds: number,
  overtime_seconds: number   // max(0, total - 38 * 3600)
}
```

`roster_shifts` = published, non-deleted shifts for the user in the timesheet's week.  
`additional_entries` = completed time_entries for the user in the same week.  
Both fetched via the service client.

---

## Section 4 — Cron fix

**File:** `src/app/api/timesheets/generate-weekly/route.ts`

After computing `rosterSeconds` for each user, add:
```ts
const { data: entries } = await service
  .from('time_entries')
  .select('duration_seconds')
  .eq('user_id', userId)
  .gte('started_at', `${weekStartStr}T00:00:00`)
  .lt('started_at', `${weekEndStr}T00:00:00`)
  .not('ended_at', 'is', null)

const entrySeconds = (entries ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
const totalSeconds = rosterSeconds + entrySeconds
```

This makes `generate-weekly` consistent with `timesheet-autosubmit`, which already includes both.

---

## Component / File Map

| Item | File | New / Modified |
|------|------|----------------|
| Additional hours form | `src/components/time/AdditionalHoursPanel.tsx` | New |
| Roster grid amber blocks | `src/components/roster/RosterGrid.tsx` | Modified |
| Timesheet approval row → clickable | `src/components/time/ManagerTimesheetView.tsx` | Modified |
| Approval detail modal | `src/components/time/TimesheetDetailModal.tsx` | New |
| Detail API route | `src/app/api/timesheets/[timesheetId]/detail/route.ts` | New |
| Cron fix | `src/app/api/timesheets/generate-weekly/route.ts` | Modified |
| Time dashboard page (plan gate) | `src/app/dashboard/time/page.tsx` | Modified |

---

## Acceptance Criteria

- [ ] Business-plan org members see AdditionalHoursPanel (not TimerWidget) on the time dashboard
- [ ] Free/Pro members see no change
- [ ] Project is required in AdditionalHoursPanel; submit disabled without one
- [ ] Logged additional hours appear as amber blocks on the roster grid, stacked below shifts
- [ ] Clicking an amber block opens an edit form
- [ ] Timesheet rows in ManagerTimesheetView are clickable and open the detail modal
- [ ] Detail modal shows roster shifts + additional entries + summary + overtime flag
- [ ] Overtime flag appears when total > 38h
- [ ] Approve and reject actions work from inside the modal
- [ ] `generate-weekly` cron includes additional time_entries in total_seconds
- [ ] `pnpm run build` passes clean
