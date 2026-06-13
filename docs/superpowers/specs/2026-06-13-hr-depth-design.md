# HR Depth — Design Spec
_2026-06-13_

## Goal

Deepen the `People` section to compete with Deputy and Employment Hero for small service businesses (1–20 staff). Add rostering, employee profiles, onboarding checklists, and certification tracking — in that priority order. No performance reviews, org chart, award interpretation, or shift-swapping in this phase.

---

## Scope

| # | Feature | Priority |
|---|---|---|
| 1 | Rostering | High — Deputy's core stickiness; makes staff check the app daily |
| 2 | Employee Profiles | High — extended profile data, documents, emergency contacts |
| 3 | Onboarding Checklists | Medium — per-org template, per-member progress |
| 4 | Certification Tracking | Medium — expiry dates, nightly push notifications |

---

## Navigation

The existing `People` nav group currently only has `Leave`. Updated structure:

```
People
  ├── Leave          (existing)
  ├── Roster         (new — /dashboard/roster)
  └── Team           (new — /dashboard/team)
```

`Team` consolidates profiles, onboarding, and certifications into one page with a drawer pattern rather than three separate nav items.

---

## Data Model

### New tables

```sql
-- 1:1 with organisation_members
employee_profiles (
  user_id        uuid references auth.users primary key,
  org_id         uuid references organisations,
  job_title      text,
  start_date     date,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  avatar_url     text,
  created_at     timestamptz default now()
)

-- Files attached to a profile
employee_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users,
  org_id         uuid references organisations,
  label          text not null,
  storage_path   text not null,
  uploaded_at    timestamptz default now()
)

-- Expiry-tracked certifications
certifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users,
  org_id         uuid references organisations,
  name           text not null,
  issued_date    date,
  expiry_date    date,
  document_path  text,
  created_at     timestamptz default now()
)

-- Org-level onboarding template
onboarding_checklists (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organisations unique,
  items          jsonb not null  -- [{ label: string, required: boolean }]
)

-- Per-member completion state
onboarding_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users,
  org_id         uuid references organisations,
  item_label     text not null,
  completed_at   timestamptz,
  unique(user_id, org_id, item_label)
)

-- Shift schedule
roster_shifts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organisations,
  user_id        uuid references auth.users,
  date           date not null,
  start_time     time not null,
  end_time       time not null,
  notes          text,
  published      boolean default false,
  deleted_at     timestamptz,   -- soft-delete when org member is removed
  created_at     timestamptz default now()
)
```

### RLS pattern

All tables gate through `organisation_members` — same pattern as the rest of the codebase. Employees see their own rows; `manager`/`admin`/`owner` see all rows in their org.

### Storage

New private Supabase bucket: `employee-docs`. Scoped per org. Used for both `employee_documents` and `certifications.document_path`.

---

## Feature Details

### Rostering (`/dashboard/roster`)

- Weekly calendar grid — one column per day, one row per team member
- Shifts render as coloured blocks; click to edit, drag to move
- "Publish week" button marks all shifts for the selected week as `published = true` and fires push notifications to affected staff via the existing web-push setup
- **Employees** see a read-only view of their own published shifts
- **Managers/admins/owners** see all shifts, published and draft
- Mobile: collapses to a day-by-day view
- Overlap constraint: DB-level check prevents assigning two overlapping shifts to the same user on the same date; surfaced as an inline form error

### Employee Profiles & Team Page (`/dashboard/team`)

- Card grid of all org members: avatar, name, job title, start date
- Manager-only badges on cards: amber = cert expiring within 30 days; red = cert expired or onboarding incomplete
- Click a card → employee detail drawer (same pattern as the existing `TaskDrawer`)
- Drawer tabs: **Profile** | **Documents** | **Certifications** | **Onboarding**
- Cert expiry summary panel in the page header: "2 certifications expiring in the next 30 days" — links to a filtered view

### Onboarding Checklists

- Org-level template configured by owner/admin (Settings or Team page prompt)
- If no template exists, the Onboarding tab shows a setup prompt — not a blank screen
- All checklist items are the same template for every new member (YAGNI — per-role templates are future work)
- Employees can tick items themselves; managers can also mark complete
- `required` items are visually distinguished; optional items are greyed

### Certification Tracking

- Expiry date is optional (degrees, qualifications with no expiry)
- Certs without expiry date never appear in the expiry dashboard
- Nightly Supabase Edge Function queries `certifications` for rows where `expiry_date` is within 30 days; fires push notification to the org's managers via the existing web-push setup
- Push failures for individual users are logged and skipped — the batch continues

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Org member removed | Their roster shifts are soft-deleted (hidden, not deleted) |
| Cert has no expiry | Expiry field optional; excluded from expiry dashboard |
| No onboarding template | Prompt shown to configure one; no blank state |
| Employee deletes profile | Cascades to documents, certs, onboarding progress — NOT to time entries, expenses, or payslips (financial records retained) |
| Push subscription missing | Logged, skipped — batch continues |

---

## Out of Scope (this phase)

- Shift-swapping and availability management
- Performance reviews and 1:1s
- Org chart
- Award interpretation / Fair Work compliance rules
- Per-role onboarding templates
