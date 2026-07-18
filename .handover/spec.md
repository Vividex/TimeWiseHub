# SWMS Form Builder

## Goal
Let a business author a SWMS from a structured form (pick one of 18 legislated High Risk
Construction Work categories, edit a pre-filled job-step/hazard/control table, generate a real
branded PDF) instead of only being able to upload an existing file. Coexists with the existing
upload path.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-18-swms-form-builder-design.md`
- Source plan: `docs/superpowers/plans/2026-07-18-swms-form-builder.md`
- Reuses the already-proven `@react-pdf/renderer` pattern (`InvoiceDocument.tsx`/
  `invoices/[id]/pdf/route.ts`) — no new npm dependency.
- `project_swms_documents` gets `category`/`content`/`source` columns; existing
  view/acknowledge/delete code needs zero changes since it only ever reads `storage_path`.
- 18 HRCW category templates (job steps/hazards/controls/PPE/licence info) are real, sourced
  content (Safe Work Australia + state WorkSafe/SafeWork guidance), researched during
  plan-writing — not invented, not placeholder.
- Licence cross-check is scoped to the real 29 HRWL codes only (cleanly matchable against a new
  `certifications.licence_class` field); every other category (most of the 18 — electrical,
  gasfitting, demolition, asbestos, shotfirer, refrigerant, traffic control) shows an
  informational note instead of a false automated match, since those need separately-issued,
  often state-varying credentials outside the HRWL scheme.
- `licence_class` dropdown on Certifications only renders for `supportsSwms` orgs (builder
  & construction / trades & field services) — gated the same way Crew/SWMS already are, so a
  tutoring org's certification form is unaffected.
- Edit lifecycle: free edit in place before any crew acknowledgment exists; once acknowledged,
  further edits create a new document (old one stays, acknowledgments don't carry over).
- Real pre-existing RLS gap found during research, fixed in this phase's migration: the
  `employee-docs` upload storage policy only allowed owner/admin, while certifications' own
  INSERT policy (schema-046) allows owner/admin/manager — a manager could add a cert row but
  fail to upload its document.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first — several tasks modify files that already exist in the shipped app
  (`EmployeeDrawer.tsx`, `TeamGrid.tsx`, `dashboard/team/page.tsx`, `ProjectSwmsPanel.tsx`,
  `clients/[id]/projects/[projectId]/page.tsx`, `certifications/route.ts`).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`, no Codex dispatch
  for that item.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-106-swms-form-builder.sql` (plan Task 1, Step 1 — exact SQL in the
  plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `swms_form_builder`)
- [x] Verify via the sanity-check queries in the plan (Step 3)
- [x] Commit: `git add supabase/schema-106-swms-form-builder.sql && git commit -m "handover: C-1 SWMS form builder migration (category/content/source, licence_class, employee-docs RLS fix)"`

---

## C-2 — Types + 18-category template library

*Codex edits:*
- [x] Extend `src/types/swms.ts` (plan Task 2, Step 1 — `HrcwCategory`, `HrwlClass`, `SwmsRow`,
  `SwmsAuthoredContent`, extended `SwmsDocument`)
- [x] Create `src/lib/swms-templates.ts` (plan Task 2, Step 2 — `HRWL_CLASSES`,
  `HRCW_CATEGORY_LABELS`, `SwmsTemplate`, `SWMS_TEMPLATES` — transcribe the 18 templates exactly
  as written in the plan, do not paraphrase). Two Codex turns needed: first hit a genuine sandbox
  blocker on the large template file and honestly reported it instead of guessing; a focused
  retry (types file already done, don't touch) completed it.
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. **Found a real plan-sequencing gap**: extending
  `SwmsDocument` to require `category`/`source` broke the existing project detail page's SWMS
  fetch/mapping (Task 6, Step 1's change), which wasn't due to land until C-6 — an intermediate
  broken build between C-2 and C-6. Per this project's standing precedent (never leave an
  intermediate broken build across commits — see Vehicle Tracking v1 notes), pulled Task 6 Step 1
  forward and applied it directly here rather than waiting. **C-6 no longer needs to touch
  `page.tsx`'s SWMS fetch/mapping — only its Steps 2-4 (button, clientId prop, category label)
  remain for that item.**
- [x] Commit: `git add src/types/swms.ts src/lib/swms-templates.ts "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" && git commit -m "handover: C-2 SWMS types + 18-category template library"`

---

## C-3 — SwmsDocumentPdf component

*Codex edits:*
- [x] Create `src/components/projects/SwmsDocumentPdf.tsx` (plan Task 3, Step 1)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/projects/SwmsDocumentPdf.tsx && git commit -m "handover: C-3 SwmsDocumentPdf component"`

---

## C-4 — Certifications licence_class field

*Codex edits:*
- [x] Modify `src/app/api/team/certifications/route.ts` (plan Task 4, Step 1 — POST accepts
  `licence_class`)
- [x] Modify `src/components/team/EmployeeDrawer.tsx` (plan Task 4, Steps 2-4 — `Cert.licence_class`,
  `showLicenceClass` prop, `newCertLicenceClass` state, dropdown gated to `showLicenceClass`)
- [x] Modify `src/app/dashboard/team/page.tsx` and `src/components/team/TeamGrid.tsx` (plan Task
  4, Step 5 — resolve `supportsSwms` and thread `showLicenceClass` through to `EmployeeDrawer`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. Found a real type bug: `getWorkspaceProfileForUser`'s
  `supportsSwms` is `boolean | undefined` (optional flag), but `TeamGrid`'s `showLicenceClass`
  prop requires plain `boolean` — fixed with `!!supportsSwms` at the call site.
- [x] Commit: `git add src/app/api/team/certifications/route.ts src/components/team/EmployeeDrawer.tsx src/components/team/TeamGrid.tsx src/app/dashboard/team/page.tsx && git commit -m "handover: C-4 certifications licence_class field"`

---

## C-5 — SWMS build page, form, and create API route

*Codex edits:*
- [x] Create `src/app/api/projects/[projectId]/swms/route.ts` (plan Task 5, Step 1)
- [x] Create `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx` (plan Task
  5, Step 2)
- [x] Create `src/components/projects/SwmsBuilderForm.tsx` (plan Task 5, Step 3)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. Confirmed both new routes appear in the build's route
  table (`/api/projects/[projectId]/swms`, `/dashboard/clients/[id]/projects/[projectId]/swms/new`).
- [x] Commit: `git add src/app/api/projects/[projectId]/swms/route.ts "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx" src/components/projects/SwmsBuilderForm.tsx && git commit -m "handover: C-5 SWMS build page, form, and create API route"`

---

## C-6 — Wire "+ Build SWMS" entry point into ProjectSwmsPanel

*Codex edits:*
- [ ] Modify `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx` (plan Task 6, Step 4
  only — `clientId` prop passed to `ProjectSwmsPanel`. **Step 1 — the SWMS fetch adding
  category/source — was already applied during C-2 to avoid an intermediate broken build; do not
  redo it, the file already selects `category, source` and maps them.**)
- [ ] Modify `src/components/projects/ProjectSwmsPanel.tsx` (plan Task 6, Steps 2-3 — "+ Build
  SWMS" button, `clientId` prop, category label per authored document)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades/construction-profile org, click "+ Build SWMS" on a project, confirm the
  category picker pre-fills the table, confirm the licence warning appears/doesn't appear
  correctly, confirm the generated PDF opens via "View" and matches what was entered, confirm the
  category label shows on the authored document's row.
- [ ] Commit: `git add src/components/projects/ProjectSwmsPanel.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" && git commit -m "handover: C-6 wire Build SWMS entry point into ProjectSwmsPanel"`

---

## C-7 — Edit-before-acknowledgment / supersede-after-acknowledgment

*Codex edits:*
- [ ] Modify `src/app/api/projects/[projectId]/swms/route.ts` (plan Task 7, Step 1 — `documentId`
  in-place-edit-or-supersede logic)
- [ ] Modify `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx` (plan Task
  7, Step 2 — `documentId` search param, `existingContent` fetch)
- [ ] Modify `src/components/projects/SwmsBuilderForm.tsx` (plan Task 7, Step 3 — pre-fill from
  `existingContent`, pass `documentId` through)
- [ ] Modify `src/components/projects/ProjectSwmsPanel.tsx` (plan Task 7, Step 4 — Edit link for
  authored documents)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: build a SWMS, edit it before anyone acknowledges (confirm it updates the same
  document, not a duplicate), have a crew member acknowledge it, edit again (confirm this time it
  creates a new document and the old one remains with its original acknowledgment intact).
- [ ] Commit: `git add src/app/api/projects/[projectId]/swms/route.ts "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx" src/components/projects/SwmsBuilderForm.tsx src/components/projects/ProjectSwmsPanel.tsx && git commit -m "handover: C-7 edit-before-ack / supersede-after-ack SWMS lifecycle"`

---

## Acceptance checklist
- [ ] C-1: migration applies cleanly (new columns + corrected employee-docs RLS).
- [ ] C-2: types and the 18-category template library compile.
- [ ] C-3: `SwmsDocumentPdf` compiles in isolation.
- [ ] C-4: licence-class dropdown appears only for `supportsSwms` orgs; certifications API accepts
  and stores it.
- [ ] C-5: "+ Build SWMS" generates a real PDF from the form, saved alongside uploaded documents.
- [ ] C-6: category label and Build entry point appear correctly in `ProjectSwmsPanel`.
- [ ] C-7: edit-before-ack updates in place; edit-after-ack creates a new document, old one
  preserved with its acknowledgments intact.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test per each task's Manual step above — requires the user's own authenticated
  session as a trades/construction-profile org member. **User follow-up, not the conductor's to
  complete.**

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after C-7, plus the "Verification" checklist in
`docs/superpowers/plans/2026-07-18-swms-form-builder.md`.
