# Client Sites — Design

## Origin

Trades & Field Services deep-dive (parallel to the earlier tutoring deep-dive in the Workspace
Profile roadmap). Competitive research against ServiceM8, Tradify, Fergus, and general 2026
field-service-management sources surfaced several gaps (quotes with digital acceptance, job
costing, multi-site customers, digital sign-off) — the user picked multi-site customers to build
this round.

## Goal

Let a client have more than one physical address — a landlord, strata manager, or multi-branch
commercial account shouldn't need a duplicate client record per property. A session (job) or
incident report can then reference a specific site instead of only the client's single address.

## Decisions made during brainstorming

- **Profile-gated, not universal.** Only `trades_field_services`, `builder_construction`,
  `cleaning_maintenance`, `real_estate` get multi-site support. Tutoring and personal training
  don't need it — explicitly ruled out for those profiles rather than shipped universally.
- **`clients.address` is untouched.** It remains the billing/default address. Sites are a separate,
  additive list purely for "where does the work happen." No migration of the existing 30 client
  rows — zero risk to current data.
- **Incident Reports' client-agnostic scope is reopened.** The original Incident Reports design
  (`2026-07-13-incident-reports-design.md`) deliberately excluded any client/job link ("this is
  not a general-purpose incident log"). This spec adds an *optional* `client_id`/`site_id` to that
  table — a deliberate, discussed reversal of that earlier call, not an oversight. The rest of that
  design (workplace-safety-only fields, no delete, ungated to all Team-plan orgs) is unchanged.
- **No vehicle-to-site linkage this round.** Vehicles aren't tied to a job/site — out of scope,
  raised and declined during brainstorming.
- **One shared label, "Sites," across all four gated profiles** — not per-industry terminology
  (e.g. "Properties" for real estate). Keeps the existing terminology system's fixed four keys
  (`client`/`session`/`program`/`project`) untouched rather than adding a fifth dynamic key for one
  feature.

## Data model

New table `client_sites`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `client_id` | uuid not null | references `clients(id)` |
| `label` | text not null | e.g. "Warehouse", "Unit 4" |
| `address` | text not null | |
| `contact_name` | text | nullable — site contact if different from the client |
| `contact_phone` | text | nullable |
| `access_notes` | text | nullable — gate code, key location, parking instructions |
| `is_archived` | boolean not null default false | soft-delete, matching `vehicles.is_archived` |
| `created_by` | uuid not null | references `auth.users` |
| `created_at` | timestamptz not null default `now()` | |

RLS: no own `owner_id`/`org_id` — visibility/edit rights mirror the parent client via
`EXISTS (SELECT 1 FROM clients WHERE clients.id = client_sites.client_id AND <clients' existing
visibility predicate>)`, the same indirection pattern already used for tables like
`incident_report_photos` hanging off `incident_reports`.

New nullable columns on existing tables:
- `sessions.site_id` → `client_sites(id)`
- `incident_reports.client_id` → `clients(id)`
- `incident_reports.site_id` → `client_sites(id)`

Migration file: `supabase/schema-104-client-sites.sql` (next number after `schema-103-whiteboard.sql`),
applied via Supabase MCP `apply_migration` per this repo's standard convention.

## Where it plugs in

**Client detail page** (`/dashboard/clients/[id]`) — new "Sites" section, visible only when the
client's org has a `supportsMultiSite` workspace profile (see Gating below). Add / edit / archive;
no hard delete, consistent with how `vehicles` and `clients` themselves are archived rather than
deleted.

**Booking a session** (`NewSessionModal`) — once a client with ≥1 active site is selected, a
"Location" dropdown appears: "Client's main address" (default, `site_id = null`) or one of that
client's sites. Not rendered at all for clients with zero sites, so ungated-profile clients (and
gated-profile clients who haven't added any sites yet) see no change to the current booking flow.

**Filing an incident report** — an optional "Client" picker is added, available to every org
regardless of workspace profile (matching Incident Reports' existing "not gated to any industry"
design). Once a client is picked, an optional "Site" sub-picker appears if that client has sites.
The existing freeform `location` text field is unchanged and always available alongside it for
extra detail (e.g. "round the back, near the loading dock").

## Gating

New `supportsMultiSite?: boolean` field on `WorkspaceProfileConfig`
(`src/lib/workspace-profiles/types.ts`), set `true` for exactly:

```
trades_field_services  ✓
builder_construction   ✓
cleaning_maintenance   ✓
real_estate            ✓
consulting             ✗
healthcare             ✗
creative_agencies      ✗
tutoring               ✗
personal_training      ✗
generic                ✗
```

Defaults to `false`/undefined for any profile not listed, so adding a new workspace profile in the
future doesn't accidentally inherit multi-site support.

## Non-goals (explicit)

- No quotes/job-costing/digital-signature work — separate gaps found during the same research
  pass, not in scope this round.
- No vehicle-to-site assignment.
- No migration of existing client addresses into sites.
- No per-industry site terminology ("Properties," "Locations," etc.) — one shared "Sites" label.
- No dedicated top-level "all sites" nav page — sites are managed entirely within their parent
  client's detail page, since a site has no standalone meaning outside its client.

## Verification

- `pnpm run build` must pass clean (this project's only gate).
- Manual smoke, as a trades-profile org:
  1. Add two sites to an existing client; confirm the client's existing billing address is
     untouched.
  2. Book a new session for that client — confirm the Location dropdown appears and defaults to
     "Client's main address"; pick a site and confirm it saves.
  3. File an incident report, pick that client, then that site; confirm it saves and displays
     correctly on the report detail/print views.
  4. Archive a site; confirm it no longer appears in the Location dropdown for new sessions but
     past sessions that reference it still display correctly.
- Manual smoke, as a tutoring-profile org: confirm the client detail page shows no "Sites" section
  at all, and the session-booking modal shows no Location dropdown.
