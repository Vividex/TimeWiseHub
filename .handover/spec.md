# Phase 17 — HR Depth (Roster, Employee Profiles, Onboarding, Certs)

## Goal
Add rostering, employee profiles, onboarding checklists, and certification
tracking to the People section to compete with Deputy and Employment Hero for
small service businesses (1–20 staff).

## Source plan
`docs/superpowers/plans/2026-06-13-hr-depth.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-13-hr-depth-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: applies DB migrations via Supabase MCP; creates storage bucket;
  deploys edge function; schedules cron; runs all shell (`pnpm run build`, `git`);
  verifies diffs; ticks boxes; commits.

## Acceptance checklist

### Task 1 — Database migrations
- [x] C1-1: Write `supabase/schema-045-employee-profiles.sql` per plan Task 1 Step 1
- [x] C1-2: Write `supabase/schema-046-certifications.sql` per plan Task 1 Step 2
- [x] C1-3: Write `supabase/schema-047-onboarding.sql` per plan Task 1 Step 3
- [x] C1-4: Write `supabase/schema-048-roster.sql` per plan Task 1 Step 4
- [x] C1-5: [CONDUCTOR] Apply migrations 045–048 via Supabase MCP `apply_migration` in order
- [x] C1-6: [CONDUCTOR] Create private `employee-docs` storage bucket via Supabase MCP
- [ ] C1-7: [CONDUCTOR] Commit

### Task 2 — Navigation update
- [ ] C2-1: Update `src/components/nav/SidebarNav.tsx` — add `CalendarRange` + `Users2` imports and Roster + Team items to People group per plan Task 2
- [ ] C2-2: [CONDUCTOR] Build check (`pnpm run build`)
- [ ] C2-3: [CONDUCTOR] Commit

### Task 3 — API routes
- [ ] C3-1: Write `src/app/api/roster/route.ts` per plan Task 3 Step 1
- [ ] C3-2: Write `src/app/api/team/profile/route.ts` per plan Task 3 Step 2
- [ ] C3-3: Write `src/app/api/team/certifications/route.ts` per plan Task 3 Step 3
- [ ] C3-4: Write `src/app/api/team/onboarding/route.ts` per plan Task 3 Step 4
- [ ] C3-5: [CONDUCTOR] Build check
- [ ] C3-6: [CONDUCTOR] Commit

### Task 4 — Roster page
- [ ] C4-1: Write `src/components/roster/ShiftForm.tsx` per plan Task 4 Step 1
- [ ] C4-2: Write `src/components/roster/RosterGrid.tsx` per plan Task 4 Step 2
- [ ] C4-3: Write `src/app/dashboard/roster/page.tsx` per plan Task 4 Step 3
- [ ] C4-4: [CONDUCTOR] Build check
- [ ] C4-5: [CONDUCTOR] Commit

### Task 5 — Team page
- [ ] C5-1: Write `src/components/team/CertExpiryPanel.tsx` per plan Task 5 Step 1
- [ ] C5-2: Write `src/components/team/EmployeeDrawer.tsx` per plan Task 5 Step 2
- [ ] C5-3: Write `src/components/team/TeamGrid.tsx` per plan Task 5 Step 3
- [ ] C5-4: Write `src/app/dashboard/team/page.tsx` per plan Task 5 Step 4
- [ ] C5-5: [CONDUCTOR] Build check
- [ ] C5-6: [CONDUCTOR] Commit

### Task 6 — Cert expiry Edge Function
- [ ] C6-1: Write `supabase/functions/cert-expiry-notify/index.ts` per plan Task 6 Step 1
- [ ] C6-2: [CONDUCTOR] Deploy Edge Function via Supabase MCP `deploy_edge_function`
- [ ] C6-3: [CONDUCTOR] Schedule nightly cron (Supabase dashboard → Cron → `0 8 * * *`)
- [ ] C6-4: [CONDUCTOR] Commit

## Verification
`pnpm run build` must pass clean after every [CONDUCTOR] build check step.
No test runner — manual smoke after final commit:
- Navigate to People → Roster: weekly grid renders, manager can add a shift, Publish button appears for unpublished shifts
- Navigate to People → Team: member cards render, clicking opens drawer with Profile / Certifications / Onboarding tabs
- Add a certification with an expiry date within 30 days → amber badge appears on the card and the CertExpiryPanel shows it
- Incomplete required onboarding item → amber badge on the card
- Employee login → sees only their own published shifts (roster read-only)
