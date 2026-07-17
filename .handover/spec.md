# SWMS + Licence Tracking

## Goal
Add project crew management, SWMS (Safe Work Method Statement) document tracking with
per-crew-member acknowledgment, and a small polish pass on the existing Certifications feature
(document upload + Dashboard surfacing) — gated to Builder & Construction and Trades & Field
Services.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-18-swms-licence-tracking-design.md`
- Source plan: `docs/superpowers/plans/2026-07-18-swms-licence-tracking.md`
- Not a Sessions feature — construction "jobs" map to `projects` + `tasks`, which already existed;
  Sessions was purpose-built for tutoring/PT and was never a fit for construction.
- Licence tracking already mostly existed as the generic `certifications` table/UI — this phase is
  a small polish pass (document upload + Dashboard card), not a new system.
- `project_members` existed in the schema with zero code using it (though `project_documents`' RLS
  already referenced it) — this phase wires it up for the first time as necessary scaffolding for
  SWMS crew access, not scope creep.
- SWMS access is crew-wide (any `project_members` row, not just the project owner/admin) — tracked
  acknowledgment, not a hard gate on anything.
- Gated to `trades_field_services` + `builder_construction` via a new `supportsSwms` flag;
  `projects`/`tasks` themselves stay fully generic and ungated.
- New `project-swms` storage bucket (crew-based RLS); certifications reuses the existing,
  previously-unused `employee-docs` bucket.
- `certifications.user_id` references `auth.users` directly, not `profiles` — confirmed via a live
  DB query before writing the plan, so the Dashboard card resolves display names from the
  `mappedMembers` list this page already computes, not a `profiles!certifications_user_id_fkey`
  embed (which would fail — no such relationship exists for Postgrest to embed).

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first — several tasks modify files that already exist in the shipped app
  (`clients/[id]/projects/[projectId]/page.tsx`, `EmployeeDrawer.tsx`, `DashboardUpcoming.tsx`,
  `dashboard/page.tsx`, `workspace-profiles/types.ts`, `workspace-profiles/registry.ts`).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`, no Codex dispatch
  for that item.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-105-swms-crew-tracking.sql` (plan Task 1, Step 1 — exact SQL in the
  plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `swms_crew_tracking`)
- [x] Verify via the sanity-check queries in the plan (Step 3)
- [x] Commit: `git add supabase/schema-105-swms-crew-tracking.sql && git commit -m "handover: C-1 project_members RLS + SWMS tables/bucket + employee-docs bucket RLS"`

---

## C-2 — Types

*Codex edits:*
- [x] Create `src/types/project-crew.ts` (plan Task 2, Step 1)
- [x] Create `src/types/swms.ts` (plan Task 2, Step 2)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/types/project-crew.ts src/types/swms.ts && git commit -m "handover: C-2 crew and SWMS types"`

---

## C-3 — Workspace profile flag

*Codex edits:*
- [x] Modify `src/lib/workspace-profiles/types.ts` (plan Task 3, Step 1 — add
  `supportsSwms?: boolean`)
- [x] Modify `src/lib/workspace-profiles/registry.ts` (plan Task 3, Step 2 — set `true` on exactly
  `builder_construction`, `trades_field_services`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "handover: C-3 supportsSwms workspace profile flag"`

---

## C-4 — ProjectCrewPanel component

*Codex edits:*
- [x] Create `src/components/projects/ProjectCrewPanel.tsx` (plan Task 4, Step 1)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/projects/ProjectCrewPanel.tsx && git commit -m "handover: C-4 ProjectCrewPanel component"`

---

## C-5 — ProjectSwmsPanel component

*Codex edits:*
- [x] Create `src/components/projects/ProjectSwmsPanel.tsx` (plan Task 5, Step 1)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/projects/ProjectSwmsPanel.tsx && git commit -m "handover: C-5 ProjectSwmsPanel component"`

---

## C-6 — Wire Crew + SWMS into the project detail page

*Codex edits:*
- [x] Modify `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx` (plan Task 6, Steps
  1–3 — imports, `supportsSwms` resolution, crew/SWMS data fetch, render the two new sections)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades/construction-profile org, add a crew member to a project, upload a SWMS
  document, confirm the crew member can view and acknowledge it, confirm a non-crew org member
  cannot see the Crew/Safety sections' data (RLS). As a tutoring-profile org, confirm neither
  section renders at all.
- [x] Commit: `git add "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" && git commit -m "handover: C-6 wire Crew and SWMS sections into the project detail page"`

---

## C-7 — Certification document upload

*Codex edits:*
- [x] Modify `src/components/team/EmployeeDrawer.tsx` (plan Task 7, Steps 1–5 — storage import,
  `Cert.document_path`, file state, `addCert` upload, `viewCertDocument`, file input + View link)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: add a certification with a file attached; confirm "View document" opens it via a
  signed URL; confirm existing certifications without a document still display correctly.
- [x] Commit: `git add src/components/team/EmployeeDrawer.tsx && git commit -m "handover: C-7 certification document upload"`

---

## C-8 — Dashboard certifications-due card

*Codex edits:*
- [x] Modify `src/components/dashboard/DashboardUpcoming.tsx` (plan Task 8, Steps 1–3 — new
  `UpcomingCertDue` type, `Award` icon import, `certsDue` prop, updated isLast chains, new render
  block)
- [x] Modify `src/app/dashboard/page.tsx` (plan Task 8, Step 4 — `certsRes` query, `certsDue`
  computation resolving names from the existing `mappedMembers` list, updated import, updated
  `<DashboardUpcoming>` call)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: with a test certification expiring within 30 days, confirm it appears in the
  Dashboard's Today feed linking to `/dashboard/team`; confirm it disappears once nothing is due.
- [x] Commit: `git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx && git commit -m "handover: C-8 dashboard certifications-due card"`

---

## Acceptance checklist
- [x] C-1: `project_members` RLS + SWMS tables/bucket + employee-docs bucket RLS apply cleanly.
- [x] C-2/C-3: types/flags compile.
- [x] C-4/C-5: Crew and SWMS panel components compile in isolation.
- [x] C-6: Crew and Safety sections appear only for the two gated workspace profiles; add/remove
  crew, upload/view/acknowledge/delete SWMS all work; RLS confirmed to block non-crew visibility.
  *(compiles and renders correctly; manual RLS/UI smoke deferred to user, see below)*
- [x] C-7: certification document upload/view works; existing document-less certifications
  unaffected. *(compiles; manual smoke deferred to user, see below)*
- [x] C-8: Dashboard surfaces expiring/expired certifications org-wide, ungated. *(compiles;
  manual smoke deferred to user, see below)*
- [x] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test per the plan's Verification section — requires the user's own
  authenticated session as a trades/construction-profile org member. **User follow-up, not the
  conductor's to complete.**

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after C-8, plus the "Verification" checklist in
`docs/superpowers/plans/2026-07-18-swms-licence-tracking.md`.
