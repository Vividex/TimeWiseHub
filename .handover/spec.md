# Phase 20 — Roster-Driven Timesheets + Recurring Roster + Configurable Pay Week

## Goal
Make the published roster the authoritative source of weekly pay hours for Business-plan orgs — timesheets auto-generate at week-end from published roster shifts; admins can set a recurring shift template so fixed schedules don't need weekly re-entry; week boundaries are org-configurable (e.g. Thu–Wed for Friday pays).

## Source plan
`docs/superpowers/plans/2026-06-14-roster-driven-timesheets.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-roster-driven-timesheets-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: applies Supabase migrations via MCP `apply_migration`; runs `pnpm run build`; commits; stores CRON_SECRET in DB before cron migration.

## Migration numbers (IMPORTANT — plan was originally written with wrong numbers)
- Task 1 → `supabase/schema-051-roster-templates.sql` (NOT 050)
- Task 2 → `supabase/schema-052-pay-week-start.sql` (NOT 051)
- Task 17 → `supabase/schema-053-roster-cron.sql` (NOT 052)

## Acceptance checklist

### Task 1 — DB Migration: roster_shift_templates table
- [ ] C1-1: [CODEX] Create `supabase/schema-051-roster-templates.sql` (exact SQL in plan Task 1 Step C1-1, with corrected number 051)
- [ ] C1-2: [CONDUCTOR] Apply migration via Supabase MCP, run build, commit

### Task 2 — DB Migration: pay_week_start_day + drop Monday constraint
- [ ] C2-1: [CODEX] Create `supabase/schema-052-pay-week-start.sql` (exact SQL in plan Task 2 Step C2-1, with corrected number 052)
- [ ] C2-2: [CONDUCTOR] Verify constraint name, apply migration, run build, commit

### Task 3 — Update derivePayPeriod() to respect weekStartDay
- [ ] C3-1: [CODEX] Replace `src/lib/payroll/period.ts` (exact code in plan Task 3 Step C3-1)
- [ ] C3-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 4 — Update pay-runs route to pass pay_week_start_day
- [ ] C4-1: [CODEX] Edit `src/app/api/pay-runs/route.ts` (exact edit in plan Task 4 Step C4-1)
- [ ] C4-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 5 — TimesheetSection: hide submit for roster-managed members
- [ ] C5-1: [CODEX] Edit `src/components/time/TimesheetSection.tsx` (exact edit in plan Task 5 Step C5-1)
- [ ] C5-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 6 — RosterGrid: week anchor respects weekStartDay
- [ ] C6-1: [CODEX] Edit `src/components/roster/RosterGrid.tsx` — update getWeekDates + props + call (exact edit in plan Task 6 Step C6-1)
- [ ] C6-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 7 — RosterGrid: "Set as recurring" button
- [ ] C7-1: [CODEX] Edit `src/components/roster/RosterGrid.tsx` — add state + setAsRecurring + button (exact edit in plan Task 7 Step C7-1)
- [ ] C7-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 8 — roster/page.tsx: fetch and pass pay_week_start_day
- [ ] C8-1: [CODEX] Edit `src/app/dashboard/roster/page.tsx` (exact edit in plan Task 8 Step C8-1)
- [ ] C8-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 9 — time/page.tsx: getWeekStartStr + pay_week_start_day + rosterManaged
- [ ] C9-1: [CODEX] Edit `src/app/dashboard/time/page.tsx` (exact edit in plan Task 9 Step C9-1)
- [ ] C9-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 10 — OrgBillingSettingsForm: add pay_week_start_day field
- [ ] C10-1: [CODEX] Edit `src/components/OrgBillingSettingsForm.tsx` (exact edit in plan Task 10 Step C10-1)
- [ ] C10-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 11 — settings/page.tsx: fetch and pass pay_week_start_day
- [ ] C11-1: [CODEX] Edit `src/app/settings/page.tsx` (exact edit in plan Task 11 Step C11-1)
- [ ] C11-2: [CONDUCTOR] Commit (bundled in C12-1)

### Task 12 — Build check + commit (Tasks 3–11)
- [ ] C12-1: [CONDUCTOR] `pnpm run build` must pass clean; then commit all 8 changed files

### Task 13 — POST /api/roster/set-template
- [ ] C13-1: [CODEX] Create `src/app/api/roster/set-template/route.ts` (exact code in plan Task 13 Step C13-1)
- [ ] C13-2: [CONDUCTOR] Commit (bundled in C16-1)

### Task 14 — GET /api/roster/generate-from-template
- [ ] C14-1: [CODEX] Create `src/app/api/roster/generate-from-template/route.ts` (exact code in plan Task 14 Step C14-1)
- [ ] C14-2: [CONDUCTOR] Commit (bundled in C16-1)

### Task 15 — GET /api/timesheets/generate-weekly
- [ ] C15-1: [CODEX] Create `src/app/api/timesheets/generate-weekly/route.ts` (exact code in plan Task 15 Step C15-1)
- [ ] C15-2: [CONDUCTOR] Commit (bundled in C16-1)

### Task 16 — Build check + commit (Tasks 13–15)
- [ ] C16-1: [CONDUCTOR] `pnpm run build` must pass clean; then commit the 3 new API route files

### Task 17 — DB Migration: nightly cron jobs
- [ ] C17-1: [CODEX] Create `supabase/schema-053-roster-cron.sql` (exact SQL in plan Task 17 Step C17-1, with corrected number 053)
- [ ] C17-2: [CONDUCTOR] Store CRON_SECRET in DB via SQL, apply migration via MCP, run build, commit

## Verification
After all tasks complete:
1. `pnpm run build` passes clean (verified after C12 and C16 and C17)
2. Settings smoke: admin changes "Pay week starts on" to Thursday → roster shows Thu–Wed columns → Time page week anchors on Thursday
3. Recurring template smoke: fill a roster week → "Set as recurring" → query `roster_shift_templates`
4. Timesheet auto-gen smoke: call `GET /api/timesheets/generate-weekly` → check `timesheets` table for submitted rows
5. Employee view: Business plan employee sees "submitted automatically from your roster" instead of submit button
