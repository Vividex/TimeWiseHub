# Vehicle Tracking v2 — Notes, Standalone Nav, Rego Lookup — Design

Follow-up to `2026-07-11-vehicle-tracking-design.md` (shipped, code complete). Three
changes to the just-shipped Vehicle Tracking feature.

## 1. Standalone nav page

`VehiclesView` moves from being embedded on `/dashboard/expenses` to its own route,
`/dashboard/vehicles`. A new "Vehicles" item is added to the sidebar's **Money** nav
group (alongside Quotes, Invoices, Expenses, Finance). The vehicle detail route moves
from `/dashboard/expenses/vehicles/[id]` to `/dashboard/vehicles/[id]` to match.

No visibility/RLS change — same crew-scoped manager access and assigned-employee-only
access as already shipped, just relocated. `BusinessExpensesView`'s vehicle-tagging
dropdown (on the Expenses page) is untouched; it just needs the same vehicle list
passed in, which the Expenses page still fetches independently.

`showVehicles`-style nav gating (only show the "Vehicles" sidebar item if the org is
on a team plan) mirrors how other team-only nav items are already gated.

## 2. Vehicle notes as an append-only log

New `vehicle_notes` table, structurally identical to `vehicle_odometer_logs`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `vehicle_id` | uuid, not null, references `vehicles(id) on delete cascade` | |
| `note` | text, not null | |
| `created_by` | uuid, references `auth.users(id)` | |
| `created_at` | timestamptz, default now() | |

Append-only — no update/delete policy, same rationale as the odometer log (correct a
mistake by adding a new note, not editing history). RLS mirrors the odometer log
exactly: select/insert scoped to whoever can access the parent vehicle
(`can_access_vehicle()`), so the assigned employee can add/read notes on their own
vehicle just like they can log odometer readings.

The existing single `vehicles.notes` text column is dropped. No real vehicle data
exists in production yet, so this is a clean removal, not a migration.

Vehicle detail page gets a new "Notes" section (list + add-note form), positioned the
same way as the odometer log section — available to `canLog` (manager+ and the
assigned employee), read-only list for anyone else who can view the vehicle.

## 3. Rego lookup

**New column:** `vehicles.state` — nullable text, one of `NSW`/`VIC`/`QLD`/`SA`/`ACT`/
`NT`/`WA`/`TAS`. Persisted (not just used transiently for the lookup call) so the
"Refresh" action on the detail page doesn't need to re-ask.

**New env var:** `CAR_REGO_API_KEY` — server-only, added via `vercel env add`, never
sent to the browser.

**New API route:** `POST /api/vehicles/lookup-rego`
- Request body: `{ registration_number: string, state: string }`
- Requires authentication (same `createClient()` session check pattern as every other
  API route in this codebase) — this is a paid call, it must never be reachable by an
  unauthenticated request.
- Calls the CarRegistrationAPI/regcheck.org.uk service server-side with
  `CAR_REGO_API_KEY`, parses its response.
- Returns `{ make: string | null, model: string | null, year: number | null, rego_expiry_date: string | null }` on success, or `{ error: string }` on failure (plate not
  found, API error, etc.) — a failure is never a 500 that breaks the form, it's a
  normal JSON error response the client shows inline.
- No caching, no rate-limiting beyond normal auth — every call costs real money
  (~$0.30), so the button is the only thing that can trigger it (confirmed in the
  design discussion: no auto-search-as-you-type anywhere).

**Add Vehicle form** (on the new `/dashboard/vehicles` page): gains `state` (select)
next to `registration_number` (text), and a "Look up" button. On click, calls the
route; on success, fills `year`/`make`/`model` and a new (client-only, not yet saved)
`regoExpiryDate` field that flows into the existing `rego_expiry_date` field when the
vehicle is actually created; on failure, shows the error inline and the form remains
fully manually-fillable — the lookup is a convenience, never a requirement to add a
vehicle.

**Vehicle detail page**: manager+ only (matches existing edit permissions — same
`canEdit` gate as the rest of the servicing/rego edit form), a "Refresh rego details"
button next to the existing rego-expiry field. Calls the same route with the vehicle's
saved `registration_number`/`state`, and populates the *in-progress edit form's*
local state (`rego_expiry_date`, plus `make`/`model`/`year` if those fields are also
present in the edit form) — exactly like the Add form's fill behaviour, not a write to
the saved record. Nothing is persisted until the user reviews the (now-filled) form
and clicks the existing "Save vehicle details" button, same as every other edit on
this page.

## Verification

- `pnpm run build` clean, as always.
- Manual: as manager, add a vehicle with a real-looking rego, click Look up, confirm
  fields populate (or confirm a graceful inline error if the API key isn't live yet in
  the environment being tested); add a note, confirm it appears in the log; confirm
  the "Vehicles" sidebar item appears/routes correctly; as the assigned employee,
  confirm they can add a note to their own vehicle but cannot see the Refresh/edit
  controls.
- This phase needs one thing only the user can do before it's fully live: sign up for
  the CarRegistrationAPI account, purchase the initial lookup-credit block, and add
  `CAR_REGO_API_KEY` to Vercel. Code ships and builds regardless, but the lookup
  button will return an error until that key exists — flagged explicitly, not a
  silent gap.
