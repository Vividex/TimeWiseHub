# Vehicle tracking

## Goal
Track company vehicles (registration, year/make/model, servicing schedule, odometer
history, employee assignment). Vehicle-related costs feed directly into the existing
Business Expenses system — no separate ledger. Manager+ get crew-scoped visibility; an
assigned employee can view/log km/log expenses for their own vehicle only. Dashboard
"Today" surfaces rego/service items about to be due.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-11-vehicle-tracking-design.md`
- Source plan: `docs/superpowers/plans/2026-07-11-vehicle-tracking.md`
- Vehicle costs are just normal `is_business` expense rows tagged with a new nullable
  `expenses.vehicle_id` — the entire "feeds business expenses" mechanism, no separate
  approval flow or reconciliation step.
- New crew-scoped RLS pattern (`can_access_vehicle()`): owner/admin always see
  everything; a manager sees a vehicle if it's unassigned, the assignee isn't in any
  crew, or the manager runs a crew the assignee belongs to; anyone can see/log km/log
  expenses for a vehicle assigned to *themselves*, regardless of role, but cannot edit
  it (editing stays manager+-gated by role, separately from `can_access_vehicle`).
  Nothing else in this codebase currently scopes visibility by crew — this is new.
- Odometer logging goes through a SECURITY DEFINER RPC (`log_vehicle_odometer`), not a
  raw table insert+update, because the assigned employee needs to update the vehicle's
  denormalized `current_odometer_km` but is deliberately NOT granted `vehicles` UPDATE
  by the RLS policies — the RPC is their one narrow, purpose-built write path.
- **Correction made during planning, not a design change:** the spec said
  "`ExpenseForm` gains a vehicle picker." That was a naming slip — `ExpenseForm.tsx`
  only creates personal (non-business) expenses. The real business-expense form is
  inline inside `BusinessExpensesView.tsx`; that's the one that gets the vehicle
  dropdown. The vehicle detail page also gets its own small, separate expense-logging
  form since an assigned employee is never shown `BusinessExpensesView` at all.
- 30-day date windows / 500km window are the "due soon" thresholds for both rego and
  servicing (spec default, not derived from an existing business rule) — named
  constants in `src/lib/vehicles.ts`, not magic numbers, shared by the vehicle detail
  badges and the dashboard "Today" widget so they can never disagree.
- Archive (`is_archived`, soft-delete) is the only retirement UI built this pass — the
  DB has an admin/owner hard-delete RLS policy for completeness, but no UI button calls
  it (rare action, deliberately trimmed, not an oversight).
- No assignment history, no per-km reimbursement rate, no re-scoping of the *existing*
  Business Expenses list by crew — all explicit out-of-scope decisions in the spec.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the
  conductor handles those.
- Read a file before editing it if its structure is unknown — especially
  `src/components/expenses/BusinessExpensesView.tsx` (surgically modified, not
  rewritten) and `src/app/dashboard/page.tsx` / `src/components/dashboard/
  DashboardUpcoming.tsx` (C-4: match against their actual current content, the plan's
  own note admits it wasn't verified against every existing prop at that call site).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and
  committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`
  (project id `sdwwlnnsijcadkdwsvud`, name `vehicle_tracking`), no Codex dispatch for
  this item.
- C-2 bundles the plan's Task 2 + Task 4 into one turn/commit — the plan explicitly
  calls out that splitting them leaves an intermediate broken build (`expenses/page.tsx`
  passes a `vehicles` prop that `BusinessExpensesView` doesn't accept until both land).
- Manual smoke test (crew isolation, assigned-employee-only visibility, dashboard Today
  due-items) requires an authenticated browser session the conductor doesn't have for
  the real org's actual team members — that final acceptance step is the user's own
  verification, same precedent as every prior phase.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [ ] Write `supabase/schema-098-vehicle-tracking.sql` (plan Task 1, Step 1 — exact SQL
  in the plan doc: `vehicles`, `vehicle_odometer_logs` tables, `expenses.vehicle_id`
  column, `can_access_vehicle()` function, all RLS policies, `log_vehicle_odometer()`
  RPC).
- [ ] Apply via Supabase MCP `apply_migration` (name: `vehicle_tracking`).
- [ ] Verify via `list_migrations` + the sanity-check query in the plan (Step 3).
- [ ] Commit: `git add supabase/schema-098-vehicle-tracking.sql && git commit -m "handover: C-1 vehicle tracking schema + RLS + odometer RPC"`

---

## C-2 — Vehicles list on Expenses page + vehicle-tag business expenses

*Codex edits:*
- [ ] Create `src/types/vehicles.ts` (plan Task 2, Step 1 — exact code in the plan doc)
- [ ] Create `src/lib/vehicles.ts` (plan Task 2, Step 2 — exact code in the plan doc)
- [ ] Create `src/components/vehicles/VehiclesView.tsx` (plan Task 2, Step 3 — exact
  code in the plan doc)
- [ ] Replace `src/app/dashboard/expenses/page.tsx` (plan Task 2, Step 4 — exact
  replacement file in the plan doc)
- [ ] Modify `src/components/expenses/BusinessExpensesView.tsx` (plan Task 4, Steps
  1-5 — add `vehicles` prop, vehicle-select state, include `vehicle_id` in the insert
  payload and form reset, add the dropdown to the form. Exact before/after code in the
  plan doc.)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/vehicles.ts src/lib/vehicles.ts src/components/vehicles/VehiclesView.tsx src/app/dashboard/expenses/page.tsx src/components/expenses/BusinessExpensesView.tsx && git commit -m "handover: C-2 vehicles list on Expenses page + vehicle-tag business expenses"`

---

## C-3 — Vehicle detail page

*Codex edits:*
- [ ] Create `src/app/dashboard/expenses/vehicles/[id]/page.tsx` (plan Task 3, Step 1
  — exact code in the plan doc)
- [ ] Create `src/components/vehicles/VehicleDetailClient.tsx` (plan Task 3, Step 2 —
  exact code in the plan doc: header/badges/assignment, odometer log + quick-add via
  the `log_vehicle_odometer` RPC, linked expenses + its own log-expense form, archive)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean; confirm the new dynamic route appears in the
  route table.
- [ ] Commit: `git add src/app/dashboard/expenses/vehicles src/components/vehicles/VehicleDetailClient.tsx && git commit -m "handover: C-3 vehicle detail page (odometer log + linked expenses)"`

---

## C-4 — Dashboard "Today" vehicle due-items

*Codex edits:*
- [ ] Modify `src/components/dashboard/DashboardUpcoming.tsx` (plan Task 5, Steps 1-4
  — add `Car`/`Wrench` icon imports, new exported `UpcomingVehicleDue` type, new
  `vehiclesDue` prop, include it in the empty-state check, render the due-item rows.
  Exact before/after code in the plan doc.)
- [ ] Modify `src/app/dashboard/page.tsx` (plan Task 5, Step 6 — add the vehicles
  query, compute `vehiclesDue` using `regoStatus`/`serviceStatus` from
  `@/lib/vehicles`, pass `vehiclesDue={vehiclesDue}` to the existing
  `<DashboardUpcoming ... />` call site — read the file first to match its exact
  current prop list, the plan doc flags this explicitly).
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx && git commit -m "handover: C-4 vehicle registration/service due items on dashboard Today"`

---

## Acceptance checklist
- [ ] C-1: `vehicles`/`vehicle_odometer_logs` tables, `expenses.vehicle_id`,
  `can_access_vehicle()`, all RLS policies, and `log_vehicle_odometer()` exist and
  apply cleanly.
- [ ] C-2: Vehicles section appears on the Expenses page for manager+ (full
  crew-scoped list) and for a plain employee with an assigned vehicle (their vehicle
  only); search-by-rego works; `BusinessExpensesView` can optionally tag a vehicle.
- [ ] C-3: Vehicle detail page shows rego/year/make/model, status badges, assignment
  (editable for manager+), odometer log + quick-add, linked expenses + log-expense
  form — both correctly gated to manager+ / the assigned employee.
- [ ] C-4: Dashboard "Today" shows rego/service due-soon items, scoped automatically
  by RLS per viewer, using the shared 30-day/500km thresholds.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (crew isolation both directions, assigned-employee-only
  visibility, dashboard Today due-items appearing/disappearing correctly) — requires
  the user's own authenticated sessions for real team members, same precedent as every
  prior phase.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint)
after every turn, full clean build after C-4, plus the manual smoke checklist in
`docs/superpowers/plans/2026-07-11-vehicle-tracking.md` ("Manual verification"
section), which requires the user's own authenticated browser sessions.
