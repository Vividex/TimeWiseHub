# Phase 27 — Business Timesheet Overhaul

## Goal
Replace clock-in/out with "Log Additional Hours" for Business-plan members, show
those hours as orange blocks on the roster grid, add a clickable manager approval
detail modal with overtime flagging, and fix the timesheet cron double-counting bug.

## Source spec
`docs/superpowers/specs/2026-06-29-business-timesheet-overhaul-design.md`

## Source plan
`docs/superpowers/plans/2026-06-29-business-timesheet-overhaul.md`

## Key decisions
- Business plan = `isTeamPlan(subscription)` = `plan === 'team'` in DB
- Additional hours color on roster: orange (`bg-orange-100 text-orange-800`) — NOT amber (amber = draft shifts)
- Overtime threshold: 38 hours = 136800 seconds; flag only, no rate calc
- No new npm packages needed
- `as unknown as T` cast required for FK joins (CLAUDE.md convention)
- Service client (`createServiceClient()`) for privileged reads; browser client for client components

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- The Supabase `as unknown as` cast pattern is required for FK join types (see CLAUDE.md).

## Rules for conductor (Claude)
- `pnpm run build` after each turn — must pass before committing.
- No DB migration needed for this phase (existing `time_entries` table is sufficient).

---

## C-1 — Fix generate-weekly cron to include time_entries

*Codex edits:*
- [x] `src/app/api/timesheets/generate-weekly/route.ts` — after computing `rosterSeconds` for each user, also query `time_entries` for the same week (`gte started_at weekStart, lt started_at weekEnd, not ended_at is null`) and add `entrySeconds` to `totalSeconds`. Batch-query all users in the org at once (not per-user).

---

## C-2 — New API: GET /api/timesheets/[timesheetId]/detail

*Codex edits:*
- [x] Create `src/app/api/timesheets/[timesheetId]/detail/route.ts` — GET handler. Auth: Supabase session + org membership check (manager/admin/owner only via service client). Fetch `roster_shifts` (published, non-deleted, in week) and `time_entries` (completed, in week) for the timesheet's user. Return `{ timesheet, profile, roster_shifts, additional_entries, rostered_seconds, additional_seconds, overtime_seconds }` where `overtime_seconds = max(0, total - 136800)`.

---

## C-3 — Create AdditionalHoursPanel component

*Codex edits:*
- [x] Create `src/components/time/AdditionalHoursPanel.tsx` — client component. Form fields: project (required `<select>`, fetches active projects), date (default today), from/to time (required, must be valid range), description (optional). On submit: INSERT into `time_entries` via browser Supabase client. Below form: list today's completed time_entries for the user (project name + time range + duration). Delete button per entry.

---

## C-4 — Update TimeSection to gate on rosterManaged

*Codex edits:*
- [x] `src/components/time/TimeSection.tsx` — add `rosterManaged?: boolean` prop (default false). When true: render `<AdditionalHoursPanel />` instead of TimerWidget + ManualEntryForm + TimeEntryList.

---

## C-5 — Pass rosterManaged to TimeSection in time/page.tsx

*Codex edits:*
- [x] `src/app/dashboard/time/page.tsx` — add `rosterManaged={isTeamPlan(subscription) && !!orgId}` to the `<TimeSection ... />` JSX.

---

## C-6 — Fetch additional entries in roster/page.tsx

*Codex edits:*
- [ ] `src/app/dashboard/roster/page.tsx` — add a fourth query in the `Promise.all` block: `time_entries` with `project_id, user_id, started_at, ended_at, duration_seconds, description, projects(name)` for the same date range (fromISO to toISO), filtered by `in('user_id', memberUserIds)`, `not ended_at is null`. Export an `AdditionalEntry` type. Pass result as `initialAdditionalEntries` prop to `<RosterGrid>`.

---

## C-7 — RosterGrid: render orange additional hours blocks

*Codex edits:*
- [ ] `src/components/roster/RosterGrid.tsx` — (1) accept `initialAdditionalEntries?: AdditionalEntry[]` prop. (2) Add state for additional entries. (3) Add `useEffect` to re-fetch on week navigation (using browser Supabase client). (4) In each day cell, after rendering shift blocks, filter additional entries by `(user_id, date)` and render orange blocks: `bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300` showing project name + duration.

---

## C-8 — Create TimesheetDetailModal component

*Codex edits:*
- [ ] Create `src/components/time/TimesheetDetailModal.tsx` — client component. Props: `data` (detail API response shape), `onClose`, `onReview(id, status, note?)`, `savingId`. Layout: header (name + week), rostered shifts list, additional entries list (orange duration text), summary row (rostered/additional/total), overtime amber warning if `overtime_seconds > 0`, Approve/Reject buttons. Reject expands inline note field before confirming.

---

## C-9 — Make ManagerTimesheetView rows clickable

*Codex edits:*
- [ ] `src/components/time/ManagerTimesheetView.tsx` — (1) Import and render `<TimesheetDetailModal>` when a row is clicked. (2) `onClick` each `<tr>`: fetch `GET /api/timesheets/${id}/detail`, set `selectedDetail` state, open modal. (3) Remove inline Approve/Reject buttons from rows (they move into the modal). (4) Add hint text: "Click a row to review before approving".

---

## Conductor commit sequence
```
After C-1         → pnpm run build → commit "fix: include additional time entries in weekly timesheet total"
After C-2         → pnpm run build → commit "feat: GET /api/timesheets/[id]/detail route"
After C-3–C-5     → pnpm run build → commit "feat: AdditionalHoursPanel replaces TimerWidget for Business plan"
After C-6–C-7     → pnpm run build → commit "feat: additional hours appear as orange blocks on roster grid"
After C-8–C-9     → pnpm run build → commit "feat: timesheet approval detail modal with overtime flag"
git push
```

## Acceptance checklist
- [x] C-1: generate-weekly cron includes time_entries in total_seconds
- [x] C-2: GET /api/timesheets/[id]/detail returns shifts + entries + overtime
- [x] C-3: AdditionalHoursPanel component created with project-required form
- [x] C-4: TimeSection renders AdditionalHoursPanel when rosterManaged=true
- [x] C-5: time/page.tsx passes rosterManaged to TimeSection
- [x] C-6: roster/page.tsx fetches additional entries and passes to RosterGrid
- [x] C-7: RosterGrid renders orange blocks for additional entries, re-fetches on week change
- [x] C-8: TimesheetDetailModal shows shifts + entries + summary + overtime flag
- [x] C-9: ManagerTimesheetView rows are clickable, open modal, no inline approve/reject

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task.
