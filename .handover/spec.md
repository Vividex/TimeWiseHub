# Vehicle tracking v2

## Goal
Three follow-ups to the shipped Vehicle Tracking feature (append-only notes log,
standalone `/dashboard/vehicles` nav page, paid rego-lookup that auto-fills
make/model/year/expiry), plus two small research-backed polish items: required
receipts on vehicle expenses and optional driver attribution on odometer readings
for shared vehicles.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-11-vehicle-tracking-v2-design.md`
- Source plan: `docs/superpowers/plans/2026-07-11-vehicle-tracking-v2.md`
- `VehiclesView` moves from an embedded section on `/dashboard/expenses` to its own
  route, `/dashboard/vehicles`, with a new sidebar item in the Money group. The
  vehicle detail route moves with it (`/dashboard/expenses/vehicles/[id]` →
  `/dashboard/vehicles/[id]`, a `git mv`-preserved rename). `BusinessExpensesView`'s
  vehicle-tagging dropdown on the Expenses page is untouched.
- New `vehicle_notes` table, structurally identical to `vehicle_odometer_logs`
  (append-only, same `can_access_vehicle()` RLS, no update/delete). The old
  single-text `vehicles.notes` column is dropped — no real vehicle data exists in
  production yet, so this is a clean removal, not a migration. **Real naming
  collision resolved during planning:** the already-shipped `VehicleDetailClient.tsx`
  had its own `notes`/`setNotes` state bound to the old column (textarea in the edit
  form, read-only display, save payload) — all of that must be removed before adding
  the new notes-log state of the same name, or there'd be two conflicting
  declarations. `Vehicle` type also needed updating (drop `notes`, add `state`) — not
  originally in the source spec, caught during the plan's own self-review.
- Rego lookup: new `vehicles.state` column, new server-only `CAR_REGO_API_KEY` env
  var, new `POST /api/vehicles/lookup-rego` route (auth-gated — this is a paid call,
  ~$0.30/lookup, purchased in blocks of ≥100). Explicit "Look up" button only — no
  auto-search-as-you-type anywhere, confirmed in design specifically because every
  call costs real money. Exact response field names are a best-effort guess (parsed
  defensively) — **must be verified against real API docs once the user has real
  credentials**, flagged explicitly in the plan, not silently assumed correct.
- Two additions made after dispatching research agents mid-session (how Fleetio/
  Samsara/Motive/Simply Fleet/AUTOsist handle vehicle expense approval and shared
  vehicles): research confirmed the existing crew-scoped approval model and
  single-assignee model are both already appropriate for this business's scale — no
  rework there. Two small, narrowly-scoped things adopted: (1) required (not
  optional) receipt on `VehicleDetailClient`'s own vehicle-expense form only —
  deliberately not touched on `BusinessExpensesView`'s general form, which has no
  receipt field for any expense type and would need separate, larger work; (2)
  optional `driven_by` column on `vehicle_odometer_logs` only, not on the shared
  `expenses` table (whose `user_id` already means "who submitted this," which can
  legitimately differ from who was driving — overloading it would pollute a shared
  table's semantics for every other expense type app-wide). A dollar-threshold
  auto-approval tier was researched but explicitly declined by the user (no real
  spend data yet to pick a sensible number).

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the
  conductor handles those.
- Read every target file first — three of the four Codex turns (C-2, C-3, C-4, and
  parts of C-6) modify files that earlier turns in *this same phase* already changed,
  so "read first" means reading the current state, not the original shipped v1 code.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and
  committing.
- C-1 and C-5 are conductor-only (pure SQL) — apply via Supabase MCP
  `apply_migration`, no Codex dispatch for those items.
- C-2 requires a `git mv` (conductor, before dispatching the rest of that turn to
  Codex) to relocate the vehicle detail route — do this first, then dispatch only the
  content edits.
- Manual smoke test (crew isolation, rego lookup with real credentials, receipt
  requirement, driven-by field) requires an authenticated browser session and real
  `CAR_REGO_API_KEY` the conductor doesn't have — that final acceptance step is the
  user's own verification, same precedent as every prior phase.
- Commit each verified item separately.

---

## C-1 — Database migration (notes table, state column, drop old notes)

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-099-vehicle-notes-and-rego-lookup.sql` (plan Task 1,
  Step 1 — exact SQL in the plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `vehicle_notes_and_rego_lookup`)
- [x] Verify via `list_migrations` + the sanity-check query in the plan (Step 3)
- [x] Commit: `git add supabase/schema-099-vehicle-notes-and-rego-lookup.sql && git commit -m "handover: C-1 vehicle notes table + state column + drop old notes column"`

---

## C-2 — Standalone `/dashboard/vehicles` nav page

*Conductor (before dispatching):*
- [x] `git mv "src/app/dashboard/expenses/vehicles" "src/app/dashboard/vehicles"`
  (plan Task 2, Step 1)

*Codex edits:*
- [x] Create `src/app/dashboard/vehicles/page.tsx` (plan Task 2, Step 2)
- [x] Replace `src/app/dashboard/expenses/page.tsx` (plan Task 2, Step 3)
- [x] Modify `src/components/nav/SidebarNav.tsx` (plan Task 2, Step 4)
- [x] Modify `src/components/vehicles/VehiclesView.tsx` (plan Task 2, Step 5 — href
  change only)
- [x] Modify `src/components/vehicles/VehicleDetailClient.tsx` (plan Task 2, Step 6 —
  back-link text/href only)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean; confirm `/dashboard/vehicles` and
  `/dashboard/vehicles/[id]` appear in the route table, and
  `/dashboard/expenses/vehicles/[id]` no longer does.
- [x] Commit: `git add src/app/dashboard/vehicles src/app/dashboard/expenses/page.tsx src/components/nav/SidebarNav.tsx src/components/vehicles/VehiclesView.tsx src/components/vehicles/VehicleDetailClient.tsx && git commit -m "handover: C-2 move Vehicles to its own nav page"`

**Conductor correction (found during verify, not in Codex's diff):** the plan's Step 6
only covered the back-link, but missed that `archiveVehicle()` in the same file still
`router.push('/dashboard/expenses')`d after archiving — a stale redirect target now
that Vehicles has moved off Expenses. Fixed directly: now pushes
`/dashboard/vehicles`.

---

## C-3 — Vehicle notes log

*Codex edits:*
- [ ] Modify `src/types/vehicles.ts` (plan Task 3, Step 0 — drop `notes`, add `state`
  on the `Vehicle` type)
- [ ] Modify `src/app/dashboard/vehicles/[id]/page.tsx` (plan Task 3, Step 1 — add the
  `vehicle_notes` fetch, exact before/after `Promise.all` in the plan doc)
- [ ] Modify `src/components/vehicles/VehicleDetailClient.tsx` (plan Task 3, Step 2 —
  **first remove** the old single-text notes state/textarea/display/save-payload
  entry tied to the now-dropped column, **then add** the new notes-log state/handler/
  section — see the plan doc's explicit "naming collision" note, this order matters)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/vehicles.ts src/app/dashboard/vehicles/[id]/page.tsx src/components/vehicles/VehicleDetailClient.tsx && git commit -m "handover: C-3 append-only vehicle notes log"`

---

## C-4 — Rego lookup

*Codex edits:*
- [ ] Create `src/app/api/vehicles/lookup-rego/route.ts` (plan Task 4, Step 1 — exact
  code in the plan doc; see the plan's "Important caveat" note about field-name
  uncertainty, that's expected, not a mistake to fix)
- [ ] Modify `.env.example` (plan Task 4, Step 2)
- [ ] Modify `src/components/vehicles/VehiclesView.tsx` (plan Task 4, Step 3 — state
  selector, Look up button, form field reshuffle — exact before/after in the plan doc)
- [ ] Modify `src/components/vehicles/VehicleDetailClient.tsx` (plan Task 4, Step 4 —
  "Refresh rego details" button)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean; confirm `/api/vehicles/lookup-rego` appears
  in the route table.
- [ ] Commit: `git add src/app/api/vehicles/lookup-rego src/components/vehicles/VehiclesView.tsx src/components/vehicles/VehicleDetailClient.tsx .env.example && git commit -m "handover: C-4 rego lookup (CarRegistrationAPI) for auto-filling vehicle details"`

---

## C-5 — Odometer driven-by migration

*Conductor (no Codex turn — pure SQL):*
- [ ] Write `supabase/schema-100-vehicle-odometer-driven-by.sql` (plan Task 5, Step 1
  — exact SQL in the plan doc; note this `create or replace function` appends a new
  defaulted parameter to the existing `log_vehicle_odometer` RPC, backward-compatible
  with the unmodified call already used in the shipped v1 code until C-6 lands)
- [ ] Apply via Supabase MCP `apply_migration` (name: `vehicle_odometer_driven_by`)
- [ ] Verify via `list_migrations` + the sanity-check query in the plan
- [ ] Commit: `git add supabase/schema-100-vehicle-odometer-driven-by.sql && git commit -m "handover: C-5 optional driven_by column on odometer log RPC"`

---

## C-6 — Required receipts + driver attribution UI

*Codex edits:*
- [ ] Modify `src/types/vehicles.ts` (plan Task 5, Step 2 — add `driven_by` to
  `VehicleOdometerLog`)
- [ ] Modify `src/components/vehicles/VehicleDetailClient.tsx` (plan Task 5, Step 3 —
  two independent changes: (a) required receipt on the vehicle-expense form, (b)
  "Driven by" select on the odometer form + RPC call + list display. Exact
  before/after code in the plan doc.)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/vehicles.ts src/components/vehicles/VehicleDetailClient.tsx && git commit -m "handover: C-6 required vehicle-expense receipts + optional driven-by on odometer log"`

---

## Acceptance checklist
- [ ] C-1: `vehicle_notes` table + RLS, `vehicles.state` column, `vehicles.notes`
  column dropped, all apply cleanly.
- [ ] C-2: "Vehicles" nav item routes to `/dashboard/vehicles`; the old embedded
  section is gone from Expenses; vehicle detail lives at `/dashboard/vehicles/[id]`.
- [ ] C-3: Notes log works (add/view, append-only), no leftover reference to the
  dropped `vehicles.notes` column anywhere.
- [ ] C-4: Add-vehicle and vehicle-detail "Look up"/"Refresh" both call the rego
  lookup API and fill fields on success, degrade gracefully on failure/missing key.
- [ ] C-5/C-6: vehicle-expense receipt is required; odometer log can optionally
  record who was driving and displays it when set.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (crew isolation, real rego lookup once `CAR_REGO_API_KEY`
  exists, receipt requirement, driven-by display) — requires the user's own
  authenticated sessions and real API credentials, same precedent as every prior
  phase.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint)
after every turn, full clean build after C-6, plus the manual smoke checklist in
`docs/superpowers/plans/2026-07-11-vehicle-tracking-v2.md` ("Manual verification"
section), which requires the user's own authenticated browser session and real
`CAR_REGO_API_KEY`.
