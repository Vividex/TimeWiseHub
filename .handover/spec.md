# Client Sites

## Goal
Let a client have more than one physical address — a landlord, strata
manager, or multi-branch commercial account shouldn't need a duplicate
client record per property. A session (job) or incident report can then
reference a specific site instead of only the client's single address.
Gated to `trades_field_services`, `builder_construction`,
`cleaning_maintenance`, `real_estate` workspace profiles.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-15-client-sites-design.md`
- Source plan: `docs/superpowers/plans/2026-07-15-client-sites.md`
- `clients.address` is untouched — stays the billing/default address. Sites
  are a separate, additive list purely for "where does the work happen." No
  migration of existing client rows.
- Deliberately reopens Incident Reports' original "no client link" scope
  decision (`2026-07-13-incident-reports-design.md`) — adds optional
  `client_id`/`site_id` there. The rest of that feature (workplace-safety
  fields, no delete, ungated to all Team-plan orgs) is unchanged.
- No vehicle-to-site linkage. No per-industry site terminology (one shared
  "Sites" label). No migration of existing addresses into sites. No
  top-level "all sites" nav page — sites live entirely under their parent
  client.
- The recurring-session path (`/api/clients/[id]/sessions/series`) already
  silently drops `studentId`/`subjectId`/`topicId` — a pre-existing gap, not
  introduced here. `site_id` follows the same precedent and is only wired
  into the non-recurring session-booking path. Do not expand scope to fix
  the recurring path.
- All CRUD is direct `supabase.from(...)` calls in `'use client'`
  components (matches this repo's existing convention — no lib-layer CRUD
  wrappers), plus one `/api/client-sites/[id]` route mirroring
  `/api/students/[id]` exactly for admin-gated edit/archive/restore.
- `ClientSitePicker` (created in C-8) is a shared component reused by both
  the new-incident-report form (C-8) and the incident-report edit view
  (C-9) — do not duplicate its fetch-on-clientId-change logic.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first — most tasks modify files that already exist
  in the shipped app (`NewSessionModal.tsx`, `IncidentReportsView.tsx`,
  `IncidentReportDetailClient.tsx`, `clients/[id]/page.tsx`,
  `clients/[id]/sessions/page.tsx`, `incident-reports/page.tsx`,
  `incident-reports/[id]/page.tsx`, `incident-reports/[id]/print/page.tsx`,
  `workspace-profiles/types.ts`, `workspace-profiles/registry.ts`,
  `types/incident-reports.ts`).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box
  and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP
  `apply_migration`, no Codex dispatch for that item.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-104-client-sites.sql` (plan Task 1, Step 1 —
  exact SQL in the plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `client_sites`)
- [x] Verify via the sanity-check queries in the plan (Step 3)
- [x] Commit: `git add supabase/schema-104-client-sites.sql && git commit -m "handover: C-1 client_sites schema + RLS"`

---

## C-2 — Types

*Codex edits:*
- [x] Create `src/types/client-sites.ts` (plan Task 2, Step 1)
- [x] Modify `src/types/incident-reports.ts` (plan Task 2, Step 2 — add
  `client_id`/`site_id` to `IncidentReport`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/types/client-sites.ts src/types/incident-reports.ts && git commit -m "handover: C-2 client site + incident report types"`

---

## C-3 — Workspace profile flag

*Codex edits:*
- [x] Modify `src/lib/workspace-profiles/types.ts` (plan Task 3, Step 1 —
  add `supportsMultiSite?: boolean`)
- [x] Modify `src/lib/workspace-profiles/registry.ts` (plan Task 3, Step 2
  — set `true` on exactly `builder_construction`, `trades_field_services`,
  `real_estate`, `cleaning_maintenance`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "handover: C-3 supportsMultiSite workspace profile flag"`

---

## C-4 — Site CRUD API route

*Codex edits:*
- [x] Create `src/app/api/client-sites/[id]/route.ts` (plan Task 4, Step 1
  — mirrors `/api/students/[id]/route.ts`, exact code in the plan doc)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/api/client-sites/[id]/route.ts && git commit -m "handover: C-4 client sites CRUD API route"`

---

## C-5 — Site CRUD UI components

*Codex edits:*
- [x] Create `src/components/client-sites/SiteForm.tsx` (plan Task 5, Step 1)
- [x] Create `src/components/client-sites/EditSiteButton.tsx` and
  `EditSiteModal.tsx` (plan Task 5, Step 2)
- [x] Create `src/components/client-sites/DeleteSiteButton.tsx` (plan Task
  5, Step 3)
- [x] Create `src/components/client-sites/RestoreSiteButton.tsx` (plan
  Task 5, Step 4)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/client-sites/ && git commit -m "handover: C-5 site CRUD UI components"`

---

## C-6 — Client Sites page + client detail page tile

*Codex edits:*
- [x] Create `src/app/dashboard/clients/[id]/sites/page.tsx` (plan Task 6,
  Step 1 — mirrors `clients/[id]/students/page.tsx`)
- [x] Modify `src/app/dashboard/clients/[id]/page.tsx` (plan Task 6, Step 2
  — `MapPin` import, `supportsMultiSite` destructure, `siteCount` query,
  gated Sites tile)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades-profile client, confirm the "Sites" tile appears
  and links to a working add/edit/archive/restore flow; as a
  tutoring-profile client, confirm no "Sites" tile appears.
- [x] Commit: `git add src/app/dashboard/clients/[id]/sites/page.tsx src/app/dashboard/clients/[id]/page.tsx && git commit -m "handover: C-6 client sites page and detail-page tile"`

---

## C-7 — Session booking site picker

*Codex edits:*
- [x] Modify `src/components/clients/NewSessionModal.tsx` (plan Task 7,
  Step 1 — `SiteOption` type, `sites` prop, `siteId` state, Location
  dropdown, `site_id` in the insert)
- [x] Modify `src/app/dashboard/clients/[id]/sessions/page.tsx` (plan Task
  7, Step 2 — fetch active sites, pass to `NewSessionModal`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: for a client with 2+ active sites, booking a session shows
  the Location dropdown defaulting to "[Client]'s main address"; picking a
  site and saving persists `site_id` (check via `execute_sql`). For a
  client with zero sites, no Location dropdown appears.
- [x] Commit: `git add src/components/clients/NewSessionModal.tsx src/app/dashboard/clients/[id]/sessions/page.tsx && git commit -m "handover: C-7 session booking site picker"`

---

## C-8 — ClientSitePicker + new incident report form

*Codex edits:*
- [ ] Create `src/components/incident-reports/ClientSitePicker.tsx` (plan
  Task 8, Step 1 — note the `isFirstRun` ref guard in the `useEffect`,
  required so mounting in edit mode with a saved `site_id` doesn't wipe it)
- [ ] Modify `src/components/incident-reports/IncidentReportsView.tsx`
  (plan Task 8, Step 2 — `clients` prop, `clientId`/`siteId` state,
  `ClientSitePicker` in the form, `client_id`/`site_id` in the insert)
- [ ] Modify `src/app/dashboard/incident-reports/page.tsx` (plan Task 8,
  Step 3 — fetch org clients, pass to `IncidentReportsView`)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/incident-reports/ClientSitePicker.tsx src/components/incident-reports/IncidentReportsView.tsx src/app/dashboard/incident-reports/page.tsx && git commit -m "handover: C-8 client/site picker on new incident reports"`

---

## C-9 — Client/site on incident report detail, edit, and print views

*Codex edits:*
- [ ] Modify `src/components/incident-reports/IncidentReportDetailClient.tsx`
  (plan Task 9, Step 1 — `clients`/`clientName`/`siteLabel` props,
  `clientId`/`siteId` state, `ClientSitePicker` in edit mode, read-only
  "Client / site" item, `client_id`/`site_id` in the update payload)
- [ ] Modify `src/app/dashboard/incident-reports/[id]/page.tsx` (plan Task
  9, Step 2 — fetch org clients, resolve `clientName`/`siteLabel`, pass to
  `IncidentReportDetailClient`)
- [ ] Modify `src/app/dashboard/incident-reports/[id]/print/page.tsx`
  (plan Task 9, Step 3 — resolve and display Client cell)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: file an incident report with a client and site selected;
  confirm it saves. Open the detail page and confirm "Client / site" reads
  correctly in both view and edit mode — specifically confirm the saved
  site is still shown selected immediately on opening edit mode (this is
  what the `isFirstRun` guard in C-8 protects against). Open the print view
  and confirm the Client cell appears. Edit an existing report to change
  its client/site and confirm the change persists.
- [ ] Commit: `git add src/components/incident-reports/IncidentReportDetailClient.tsx src/app/dashboard/incident-reports/[id]/page.tsx src/app/dashboard/incident-reports/[id]/print/page.tsx && git commit -m "handover: C-9 client/site on incident report detail, edit, and print views"`

---

## Acceptance checklist
- [ ] C-1: `client_sites` table + RLS + new FK columns on `sessions` and
  `incident_reports` apply cleanly.
- [ ] C-2/C-3: types/flags compile.
- [ ] C-4/C-5: site CRUD API + UI components compile in isolation.
- [ ] C-6: Sites tile appears only for the four gated workspace profiles;
  add/edit/archive/restore all work.
- [ ] C-7: session booking offers a site picker only for clients with
  active sites; `site_id` persists correctly.
- [ ] C-8/C-9: incident reports can be filed and edited with an optional
  client/site, displayed correctly on detail and print views; the edit-mode
  mount bug (siteId wiped on open) does not regress.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test per the plan's Verification section — requires the
  user's own authenticated session as a trades-profile org member.
  **User follow-up, not the conductor's to complete.**

## Verification
No test runner in this project — verification is `pnpm run build` (tsc +
eslint) after every turn, full clean build after C-9, plus the
"Verification" checklist in
`docs/superpowers/plans/2026-07-15-client-sites.md`.
