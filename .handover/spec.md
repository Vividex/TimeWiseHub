# Incident reports

## Goal
Let owner/admin/manager roles file, review, close, and permanently retain
workplace safety incident reports (injury / near-miss / hazard), with
crew-scoped visibility, optional photo attachments, a print view, and a
Dashboard "Today" surface for open reports.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-13-incident-reports-design.md`
- Source plan: `docs/superpowers/plans/2026-07-13-incident-reports.md`
- No industry gating — every Team-plan org gets this, same as Vehicle Tracking.
- Filing/editing/closing is owner/admin/manager only. Employees get read-only
  access to a report only if they're its `employee_id` or in `witness_ids`.
- No DELETE capability anywhere — no RLS delete policy on either table, no
  delete button in any UI. Once `status = 'closed'`, a report is immutable
  (no RLS UPDATE policy matches a closed row, including for the owner).
- Printing is a plain print-styled route (like `/dashboard/invoices/[id]/print`),
  not real PDF generation — no new dependency.
- No push/email notification on filing.
- Crew-scoped visibility reuses the exact `can_access_vehicle()` shape via a
  new `can_access_incident_report(org_id, employee_id, witness_ids)` function.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first — several tasks modify files that either
  already exist in the shipped app (`DashboardShell.tsx`, `DashboardUpcoming.tsx`,
  `dashboard/page.tsx`, `SidebarNav.tsx`) or were created earlier in this same
  phase.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box
  and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`,
  no Codex dispatch for that item.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-101-incident-reports.sql` (plan Task 1, Step 1 —
  exact SQL in the plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `incident_reports`)
- [x] Verify via the sanity-check queries in the plan (Step 3)
- [x] Commit: `git add supabase/schema-101-incident-reports.sql && git commit -m "handover: C-1 incident reports schema + RLS + photo storage"`

---

## C-2 — Types

*Codex edits:*
- [ ] Create `src/types/incident-reports.ts` (plan Task 2, Step 1 — exact
  code in the plan doc)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/incident-reports.ts && git commit -m "handover: C-2 incident report types"`

---

## C-3 — List page + new-report form + nav entry

*Codex edits:*
- [ ] Create `src/lib/incident-reports.ts` (plan Task 3, Step 1)
- [ ] Create `src/app/dashboard/incident-reports/page.tsx` (plan Task 3, Step 2)
- [ ] Create `src/components/incident-reports/IncidentReportsView.tsx` (plan
  Task 3, Step 3)
- [ ] Modify `src/components/nav/SidebarNav.tsx` (plan Task 3, Step 4 — nav
  and the list page ship together deliberately, see the plan's note on why)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean; confirm `/dashboard/incident-reports`
  appears in the route table.
- [ ] Commit: `git add src/app/dashboard/incident-reports/page.tsx src/components/incident-reports/IncidentReportsView.tsx src/lib/incident-reports.ts src/components/nav/SidebarNav.tsx && git commit -m "handover: C-3 incident reports list page + new-report form + nav entry"`

---

## C-4 — Detail page: view, edit, close, photos

*Codex edits:*
- [ ] Create `src/app/dashboard/incident-reports/[id]/page.tsx` (plan Task 4,
  Step 1)
- [ ] Create `src/components/incident-reports/IncidentReportDetailClient.tsx`
  (plan Task 4, Step 2)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean; confirm
  `/dashboard/incident-reports/[id]` appears in the route table.
- [ ] Commit: `git add src/app/dashboard/incident-reports/[id]/page.tsx src/components/incident-reports/IncidentReportDetailClient.tsx && git commit -m "handover: C-4 incident report detail page — view, edit, close, photos"`

---

## C-5 — Print view

*Codex edits:*
- [ ] Modify `src/components/DashboardShell.tsx` (plan Task 5, Step 1 —
  rename `isInvoicePrint` to `isPrintRoute` and generalize the path check;
  exact before/after in the plan doc)
- [ ] Create `src/app/dashboard/incident-reports/[id]/print/page.tsx` (plan
  Task 5, Step 2)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean; confirm
  `/dashboard/incident-reports/[id]/print` appears in the route table.
- [ ] Manual check: visit an existing invoice's print page, confirm it still
  renders without the sidebar (the `isPrintRoute` rename must not regress it).
- [ ] Commit: `git add src/app/dashboard/incident-reports/[id]/print/page.tsx src/components/DashboardShell.tsx && git commit -m "handover: C-5 incident report print view"`

---

## C-6 — Dashboard "Today" widget integration

*Codex edits:*
- [ ] Modify `src/components/dashboard/DashboardUpcoming.tsx` (plan Task 6,
  Step 1 — new `UpcomingIncidentReport` type, `incidentReportsDue` prop, new
  list section; exact before/after in the plan doc)
- [ ] Modify `src/app/dashboard/page.tsx` (plan Task 6, Step 2 — new
  `incidentReportsRes` query following the exact unconditional pattern
  `vehiclesRes` already uses, no app-level role gate; exact before/after in
  the plan doc)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx && git commit -m "handover: C-6 open incident reports on the Dashboard Today widget"`

---

## Acceptance checklist
- [ ] C-1: `incident_reports` + `incident_report_photos` tables, RLS, storage
  bucket all apply cleanly.
- [ ] C-2/C-3: "Incident Reports" nav item routes to
  `/dashboard/incident-reports`; owner/admin/manager can file a report;
  employees cannot.
- [ ] C-4: report detail view/edit works while open; closing locks it;
  photo upload works while open, disappears once closed.
- [ ] C-5: print page renders cleanly without the sidebar; existing invoice
  print page still works.
- [ ] C-6: open reports show on the Dashboard Today widget for
  owner/admin/manager (and for the employee/witness named in one); closing a
  report removes it from the widget.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (crew isolation, employee/witness read-only access,
  closed-report immutability via direct RLS attempt, no delete capability
  anywhere) — requires the user's own authenticated sessions for real team
  members, same precedent as every prior phase.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc +
eslint) after every turn, full clean build after C-6, plus the "Manual
verification" checklist in
`docs/superpowers/plans/2026-07-13-incident-reports.md`, which requires the
user's own authenticated browser sessions across multiple roles.
