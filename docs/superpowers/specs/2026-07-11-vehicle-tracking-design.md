# Vehicle Tracking — Design

## Goal

Track company vehicles (registration, year/make/model, servicing schedule,
odometer history, employee assignment) and have vehicle-related costs feed
directly into the existing Business Expenses system — no separate ledger to
reconcile.

## Where it lives

Not a new top-level nav item. A new "Vehicles" section on the existing
Expenses page (`/dashboard/expenses`), positioned after `BusinessExpensesView`.
Vehicle detail gets its own route (`/dashboard/expenses/vehicles/[id]`) since
there's too much content (odometer log, linked expenses, servicing status,
assignment) for a modal.

## Data model

### `vehicles` (new table)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid, not null, references `organisations(id)` | Fleet/team feature — requires an org. Solo users without an org don't get vehicle tracking. |
| `registration_number` | text, not null | Primary identifier. Searchable. |
| `year` | smallint, nullable | |
| `make` | text, nullable | |
| `model` | text, nullable | |
| `assigned_user_id` | uuid, nullable, references `auth.users(id)` | Current assignment only — no history tracked. |
| `current_odometer_km` | integer, nullable | Denormalized latest reading, updated whenever a new `vehicle_odometer_logs` row is inserted. |
| `next_service_due_date` | date, nullable | |
| `next_service_due_km` | integer, nullable | Service is due when *either* threshold is hit (date or km), whichever comes first. |
| `rego_expiry_date` | date, nullable | |
| `notes` | text, nullable | |
| `is_archived` | boolean, not null, default false | Soft-delete/retire. Keeps expense history links intact. |
| `created_by` | uuid, references `auth.users(id)` | |
| `created_at` | timestamptz, default now() | |

### `vehicle_odometer_logs` (new table)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `vehicle_id` | uuid, not null, references `vehicles(id) on delete cascade` | |
| `odometer_km` | integer, not null | |
| `logged_at` | date, not null, default current_date | |
| `logged_by` | uuid, references `auth.users(id)` | |
| `notes` | text, nullable | |
| `created_at` | timestamptz, default now() | |

**Append-only.** No update/delete policy. A wrong reading is corrected by
logging a new one, not editing history — same spirit as approved timesheets
not being retroactively edited. Inserting a new log row also updates the
parent vehicle's `current_odometer_km` (application-layer side effect, not a
trigger, to keep the write path simple and visible in one place).

### `expenses` (existing table — one new column)

Add nullable `vehicle_id uuid references vehicles(id) on delete set null`.

This is the entire mechanism by which vehicle costs "feed business expenses"
— logging a fuel/service/rego-renewal cost just creates a normal
`is_business = true` expense row tagged to a vehicle. It automatically
reuses: receipt upload, the manager-creates/admin-approves workflow, and the
Finance page's category pie chart. No separate sync step, nothing to drift
out of consistency.

(Rejected alternative: a standalone `vehicle_expenses` table with its own
approval flow. More isolated, but duplicates logic that already exists and
wouldn't show up in the existing pie chart without extra reconciliation
code.)

## Visibility / RLS model

**Owners and admins:** full visibility and management of all vehicles in
the org, always. No restriction.

**Managers:** can view and manage a vehicle if either:
- it's unassigned, or
- the assignee isn't in any crew (org-wide fallback — the crew restriction
  only kicks in once someone is actually on a crew), or
- the manager manages *any* crew the assignee belongs to (checked via
  `crews.manager_id`, OR'd across all the assignee's crews if they're on
  more than one).

A manager who doesn't meet this cannot see the vehicle at all — a direct
URL hit returns 404 (RLS returns no row), not a generic error, so it
doesn't leak the vehicle's existence.

This is a new visibility pattern — nothing in the codebase currently scopes
manager visibility by crew (crew membership itself is currently viewable by
any org member). It only applies to the `vehicles` and
`vehicle_odometer_logs` tables. **It does not retroactively restrict the
existing Business Expenses list** — an expense tagged to a vehicle stays
visible to any manager/admin/owner exactly like every other business
expense today. Re-scoping the existing expenses RLS by crew would be a much
bigger change than what was asked for.

**Employees:** if a vehicle is assigned to them, they can:
- view that vehicle's details (read-only — no edit/reassign/archive/delete)
- add odometer log entries for it
- create `is_business` expenses tagged to it (fuel, tolls, minor repairs —
  still goes through the normal admin/owner approval flow)
- view expenses tagged to it (so they can check status of what's been
  logged)

An employee with no assigned vehicle sees nothing in the Vehicles section.

Implementation note: the employee carve-outs on `expenses` INSERT/SELECT
are additional, narrowly-scoped permissive policies layered on top of the
existing business-expense policies (same technique used in
`schema-097-fix-organisation-onboarding-rls.sql` — Postgres ORs multiple
permissive policies together for the same command), not a change to the
existing manager-creates rule.

## UI & components

One `VehiclesView` component (not separate manager/employee variants) is
rendered on `/dashboard/expenses` for anyone who can see at least one
vehicle — RLS naturally limits the result set, so an employee's "fleet"
view is just their one assigned vehicle. "+ Add vehicle" and
edit/reassign controls are hidden client-side for non-managers (and
blocked server-side by RLS regardless).

Search is by registration number, using the existing `useTextFilter` hook
(same one used for Invoices/Students).

Vehicle detail page (`/dashboard/expenses/vehicles/[id]`):
- Header: rego, year/make/model, assignment (editable dropdown for
  manager+, read-only for the assigned employee), colour-coded badges for
  rego-expiry and servicing status (ok / due soon / overdue).
- Odometer log: history list + a quick-add reading form (assigned employee
  and manager+).
- Linked expenses: list of `expenses` rows where `vehicle_id` matches,
  reusing existing expense-row display, with a "+ Log expense" button
  (assigned employee and manager+, matching the RLS carve-out above) that
  opens `ExpenseForm` pre-filled with this vehicle.
- Manager+ (crew-scoped) only: edit details, reassign. Admin/owner only:
  archive/delete.

`ExpenseForm` gains a new optional vehicle-picker dropdown (populated from
vehicles the current user can see) so a vehicle can also be tagged when
logging an expense from the main Expenses page, not only from a vehicle's
own page.

## Dashboard "Today" integration

Extends the existing `DashboardUpcoming` widget (already renders due-soon
items for recurring subscriptions/business expenses) with two new item
kinds, following the exact same row pattern (icon badge, title, urgency
label, link):

- **Rego due** — `rego_expiry_date` within 30 days, or already passed.
- **Service due** — `next_service_due_date` within 30 days, **or**
  `current_odometer_km` within 500km of `next_service_due_km` — whichever
  trips first, matching the date-or-km servicing model.

Unlike the existing due-expense items, these link through to the vehicle
detail page rather than offering a "mark paid" action — you resolve them by
actually servicing/renewing the vehicle and updating the due date/km there.

No special-case query logic needed for role scoping: the query runs
through the same RLS-scoped connection as the rest of the dashboard, so an
employee's "Today" automatically only shows their own assigned vehicle's
alerts, a manager's shows their crew's (+ unassigned), and admin/owner see
everything — for free, from the RLS model above.

30 days / 500km are reasonable defaults (registration and servicing need
lead time to book, unlike a subscription that just charges), not
hard-coded against a specific business rule elsewhere.

## Edge cases

- Retiring a vehicle uses `is_archived`, not deletion — expense history
  stays intact. Hard delete (admin/owner only) nulls `expenses.vehicle_id`
  via the FK rather than deleting expense rows.
- No odometer log yet → `current_odometer_km` is null → km-based service
  check simply doesn't fire; falls back to date-only. Not an error state.
- Employee in multiple crews → visibility check is "manages *any* crew this
  person belongs to," not just one.

## Out of scope (explicit decisions, not oversights)

- No assignment history — only current assignment is tracked.
- No re-scoping of the existing Business Expenses list/approval RLS by
  crew — only the vehicle entity itself is crew-scoped.
- No per-km reimbursement-rate calculation — odometer logging is for
  servicing-due tracking and usage visibility, not a mileage-reimbursement
  feature.

## Verification (no test runner — manual + two-account checks)

- `pnpm run build` clean (tsc + eslint).
- As owner: create a vehicle, assign to an employee, log an odometer
  reading, log a vehicle expense, approve it, confirm it appears in
  Business Expenses and the Finance page's category pie chart.
- As the assigned employee: confirm they see only their vehicle (not the
  full fleet), can log km/expenses for it, cannot edit/reassign it or see
  other vehicles.
- As a manager who does *not* manage the assignee's crew vs. the manager
  who *does*: confirm the isolation actually holds in both directions.
- Confirm the dashboard "Today" widget shows rego/service items correctly
  per role, and that an item disappears once its due date/km is pushed out
  past the threshold.
