# Incident Reports — Design

## Goal
Let managers, admins, and owners file, review, and permanently retain workplace
safety incident reports (injuries, near-misses, hazard observations) for their
team. Not gated to any industry — every Team-plan business gets it, the same way
Vehicle Tracking isn't gated.

## Explicitly out of scope (raised and declined during brainstorming)
- **Property/equipment/vehicle damage incidents** and **client-facing complaint
  incidents** — the user chose "workplace safety" specifically over these when
  asked; this is not a general-purpose incident log. No link to `vehicles` is
  added even though Vehicle Tracking already exists — conflating the two would
  blur a scope the user deliberately narrowed.
- **Real PDF file generation** — no new PDF-generation dependency. Printing
  works exactly like the existing invoice print page
  (`/dashboard/invoices/[id]/print`): a plain print-styled route, "Save as PDF"
  via the browser's own print dialog.
- **Push/email notification on filing** — reports surface via the list page and
  the Dashboard "Today" widget, not an urgent alert. Explicitly declined in
  favour of the plainer review-when-you-check-the-list model.
- **Deletion** — no delete capability at all, not even for the owner. Treated as
  a permanent compliance/legal record. Explicitly chosen over an owner-only
  hard-delete option (which exists for vehicles) because losing an incident
  record has real legal/insurance downside that losing a vehicle record doesn't.
- **Industry gating** — available to every Team-plan org regardless of
  `workspace_profile`, not just trades/construction/healthcare-style profiles.

## Data model

New table `incident_reports`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null | references `organisations` |
| `type` | text not null | `injury` \| `near_miss` \| `hazard` |
| `severity` | text not null | `minor` \| `moderate` \| `serious` \| `critical` |
| `occurred_at` | timestamptz not null | date & time of the incident |
| `location` | text | free text, e.g. a job site address |
| `description` | text not null | what happened |
| `employee_id` | uuid | references `auth.users` — who the incident is about (nullable: a hazard observation may not involve a specific person) |
| `witness_ids` | uuid[] | references `auth.users`, zero or more |
| `body_part` | text | injury-only |
| `first_aid_given` | boolean | injury-only |
| `medical_treatment_required` | boolean | injury-only |
| `time_off_work` | boolean | injury-only |
| `root_cause` | text | |
| `corrective_action` | text | |
| `status` | text not null default `'open'` | `open` \| `closed` |
| `filed_by` | uuid not null | references `auth.users`, set automatically |
| `reviewed_by` | uuid | set on close |
| `reviewed_at` | timestamptz | set on close |
| `resolution_notes` | text | set on close |
| `created_at` | timestamptz not null default now() | |
| `updated_at` | timestamptz not null default now() | |

New table `incident_report_photos` (mirrors the existing receipt-upload pattern
used for vehicle expenses — private storage bucket, path-based RLS):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `incident_report_id` | uuid not null | references `incident_reports` on delete cascade |
| `storage_path` | text not null | |
| `uploaded_by` | uuid not null | |
| `created_at` | timestamptz not null default now() | |

The injury-specific fields (`body_part`, `first_aid_given`,
`medical_treatment_required`, `time_off_work`) are simply left null when
`type != 'injury'` — no separate table, this isn't complex enough to warrant
splitting.

## Permissions

- **File a report**: owner, admin, or manager. Same role tier that can already
  edit vehicle details.
- **View**:
  - Owner/admin: every report in the org.
  - Manager: crew-scoped — reports involving their own crew's members, plus
    anyone not assigned to a crew. Reuses the exact visibility shape already
    proven for vehicles (mirrors `can_access_vehicle`'s crew-scoping logic, new
    helper function `can_access_incident_report(org_id, employee_id)` following
    the same structure).
  - Employee: **only** a report where `employee_id` = themselves **or** they
    appear in `witness_ids`, and read-only either way. Cannot file, edit, or
    see any report they're not named in.
- **Edit**: filer or another owner/admin/manager, only while `status = 'open'`.
- **Close**: owner/admin/manager sets `status = 'closed'`, `reviewed_by`,
  `reviewed_at`, `resolution_notes` in one action. Once closed, the report is
  locked — no RLS UPDATE policy matches a closed row, full stop (not even to
  reopen it — if that's ever needed, it's a deliberate future decision, not an
  accidental gap).
- **Delete**: nobody. No DELETE RLS policy exists on this table at all.

## Pages

- **Nav**: new "Incident Reports" item in the **People** sidebar group
  (alongside Leave, Roster, Team, Crews).
- **List** — `/dashboard/incident-reports`: every report the viewer can see,
  status and severity badges, filterable. Visual pattern matches the Vehicles
  list.
- **New report**: "+ New report" button (owner/admin/manager only) opens the
  form described in Data model above.
- **Detail** — `/dashboard/incident-reports/[id]`: full report; editable per
  the rules above; "Close report" action for permitted roles.
- **Print** — `/dashboard/incident-reports/[id]/print`: plain print-styled
  route, same shell-bypass pattern `DashboardShell.tsx` already uses for
  invoice printing (`isInvoicePrint` check extended to also match this path,
  or generalized into an `isPrintRoute` check covering both).

## Dashboard integration

Open incident reports appear in the Dashboard "Today" widget
(`DashboardUpcoming.tsx`) for owner/admin/manager, alongside the existing
vehicle rego/service due-items — same list, same visual treatment, just another
item kind.

## Manual verification (no test runner in this project)
- File a report as a manager; confirm an employee cannot file one.
- Confirm an employee can see a report where they're `employee_id`, but not
  one where they aren't.
- Confirm a manager sees only their crew's reports; owner/admin sees all.
- Close a report; confirm it becomes read-only and no UPDATE succeeds against
  it via RLS, even as owner.
- Confirm the print page renders cleanly and the browser's "Save as PDF" works.
- Confirm an open report shows up on the Dashboard "Today" widget for
  owner/admin/manager, and does not for an employee with no involvement.
