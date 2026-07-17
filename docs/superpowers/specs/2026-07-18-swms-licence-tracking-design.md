# SWMS + Licence Tracking — Design

## Origin

Follow-up to the Trades & Field Services deep-dive. Three parallel research agents (competitor
construction software, on-site worker daily needs, Australian construction compliance)
independently converged on SWMS + high-risk-work licence tracking as the single strongest
cross-validated gap — two of the three agents named it their top pick from completely different
research angles (one studying site-worker needs, one studying WHS/SOPA law).

## Decisions made during brainstorming

- **Not a Sessions feature.** The user clarified Sessions was purpose-built to bridge tutoring and
  personal training's "single lesson/appointment" model and was never a natural fit for
  construction. Construction "jobs" map to the existing `projects` + `tasks` tables instead —
  `projects` already has `client_id`, `budget_hours`/`budget_dollars`, and (unused) `project_members`
  for a crew; `tasks` has a single `assignee_id` under a project. SWMS is designed against Projects,
  not Sessions.
- **Licence tracking already mostly exists.** The `certifications` table (name, issued/expiry date,
  document_path) is already fully wired up: an add/list/delete UI in the Team page's
  `EmployeeDrawer`, per-member expired/expiring badges on `TeamGrid`, and an org-wide
  `CertExpiryPanel`. This round is a small polish pass (document upload + Dashboard surfacing), not
  a new system — building a parallel licence table would duplicate this.
- **`project_members` is genuinely empty today** — the table exists in the schema with zero code
  referencing it anywhere. Building a small "Crew" management UI (add/remove org members on a
  project) is treated as necessary scaffolding for SWMS access, not scope creep, since SWMS access
  is explicitly defined as "anyone on the project's crew."
- **SWMS access, not just upload, is crew-wide.** The user was explicit: every employee working the
  job needs to be able to view and acknowledge the SWMS documents relevant to their project — not
  just the project owner or an admin. Upload/management stays owner/admin/manager only, matching
  every other admin-controlled content type in the app (Incident Reports, Vehicle Danger Zone).
- **Tracked, not a hard gate.** Acknowledgment is visible (who has/hasn't acknowledged each SWMS
  document) but doesn't block a task moving to `in_progress` or anything else in the app. Matches
  how Incident Reports already works — a compliance record, not a workflow gate. Avoids edge cases
  like a SWMS added after a task is already underway.
- **Gated to Builder & Construction + Trades & Field Services.** Both encounter Safe Work
  Australia's "high risk construction work" category (heights, electrical, excavation, mobile
  plant, etc.), so both have a genuine legal need. The underlying `projects`/`tasks` tables stay
  fully generic and ungated — only the new Crew and Safety (SWMS) sections are profile-gated.
- **Certifications stays ungated.** It's a pre-existing, industry-agnostic feature already live for
  every Team-plan org; this round only adds a document-upload field to the existing form and a
  Dashboard card, no new gating logic.
- **Reuses the existing `employee-docs` storage bucket** for certification documents (already
  exists, already scoped to employee-record content) — no new bucket needed there. SWMS gets its
  own new bucket (`project-swms`) since its access model (crew-based) is genuinely different from
  `project-documents`' confidential-flag model and shouldn't be retrofitted into that bucket's
  existing RLS shape.

## Data model

### `project_members` (existing table, currently unused — add RLS + wire up)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `project_id` | uuid not null | references `projects` |
| `user_id` | uuid not null | references `auth.users` |

RLS: crew members (rows where `user_id = auth.uid()`) plus org owner/admin/manager can view a
project's crew list; only owner/admin/manager can insert/delete rows — mirrors the existing
`can_access_vehicle()`-style indirection pattern already used elsewhere for role-gated management
of a list that non-managers can still read.

### `project_swms_documents` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `project_id` | uuid not null | references `projects` |
| `name` | text not null | e.g. "Working at Heights — Scaffold Install" |
| `storage_path` | text not null | path in the new `project-swms` bucket |
| `uploaded_by` | uuid not null | references `auth.users` |
| `created_at` | timestamptz not null default `now()` | |

### `project_swms_acknowledgments` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `swms_document_id` | uuid not null | references `project_swms_documents` on delete cascade |
| `user_id` | uuid not null | references `auth.users` |
| `acknowledged_at` | timestamptz not null default `now()` | |

Unique constraint on `(swms_document_id, user_id)` — one acknowledgment per person per document;
re-tapping "I've read and understood this" is a no-op, not a duplicate row.

RLS on both SWMS tables: crew members (via `project_members`) plus owner/admin/manager can view;
only owner/admin/manager can insert/delete `project_swms_documents`; any crew member can insert
their own acknowledgment row (`user_id = auth.uid()`) but never on behalf of someone else, and
acknowledgments are never deletable (permanent record, matching the Incident Reports precedent).

New storage bucket `project-swms` (private): readable by anyone who can read the parent
`project_swms_documents` row per the RLS above; writable by owner/admin/manager only.

### `certifications` (existing table — no schema change, UI-only additions)

Already has `document_path`; this phase adds the missing upload control that writes to it.

## Where it plugs in

**Project detail page** (`/dashboard/clients/[id]/projects/[projectId]`) — two new sections,
gated on `supportsSwms` (new workspace-profile flag, see Gating below):

- **Crew** — list of current `project_members` with a name/photo; owner/admin/manager get an
  "Add to crew" picker (org members not already on the project) and a remove action per row.
- **Safety (SWMS)** — list of `project_swms_documents`. Each shows a "View" action (signed URL,
  same pattern as `DocumentPanel`) and an acknowledgment summary ("3 of 4 crew acknowledged" for
  managers, "✓ Acknowledged" / an "I've read and understood this" button for the current user if
  they're on the crew and haven't acknowledged yet). Owner/admin/manager additionally get an
  upload control.

**Team page** (`EmployeeDrawer`'s Certifications tab) — the existing add-certification form
(name + expiry date inputs) gains a file input; on submit, uploads to `employee-docs` before
inserting the `certifications` row with `document_path` set. Existing certifications without a
document keep working exactly as today (nullable field, unchanged).

**Dashboard** (`DashboardUpcoming.tsx` or a new card alongside it, following the existing vehicle
rego/service "due soon" pattern) — a new card surfacing certifications expiring within 30 days or
already expired, org-wide, linking through to the Team page. Ungated — available to every Team-plan
org, matching Certifications' existing scope.

## Gating

New `supportsSwms?: boolean` field on `WorkspaceProfileConfig`, set `true` for exactly
`trades_field_services` and `builder_construction`. Defaults to `false`/undefined everywhere else,
consistent with how `supportsMultiSite` was added.

## Non-goals (explicit)

- No hard gate on task/project status transitions — acknowledgment is a tracked record only.
- No SWMS document authoring/templating — upload only (PDF/photo), same as every other
  document-upload feature in this app.
- No licence-class taxonomy or scheduling-time expiry warnings for Certifications — free-text name
  + expiry date only, as it already is today; scheduling integration was explicitly deferred by the
  user to a possible future round.
- No multi-person task assignment — `tasks.assignee_id` stays single-person; the crew concept
  lives at the project level via `project_members`, not the task level.
- No changes to Sessions, and no removal of Sessions for construction orgs — that's a separate,
  larger decision the user is still considering, out of scope here.

## Verification

- `pnpm run build` must pass clean (this project's only gate).
- Manual smoke, as a trades/construction-profile org:
  1. Add two org members to a project's Crew; confirm a third, non-crew org member cannot see the
     project's Safety section at all (RLS + UI both respect crew membership).
  2. Upload a SWMS document as a manager; confirm both crew members can view it and each can
     acknowledge it independently; confirm the manager's view shows "2 of 2 acknowledged."
  3. Confirm nothing in the app blocks any action based on acknowledgment state.
  4. Add a certification with a document attached; confirm it can be viewed back via a signed URL.
  5. Confirm the Dashboard shows a certifications-expiring card when a test certification's expiry
     date is within 30 days, and that it's absent when nothing is expiring.
- Manual smoke, as a tutoring-profile org: confirm no Crew or Safety sections appear on a project at
  all; confirm Certifications and the Dashboard expiry card still work identically (ungated).
