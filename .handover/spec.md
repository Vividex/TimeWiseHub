# JSA Document Type + Reusable Signatures

## Goal
Add a Job Safety Analysis (JSA) document type — the everyday-hazard counterpart to the legislated
SWMS builder — sharing its infrastructure end to end, plus a reusable per-user digital signature
rendered into both document types on demand.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-18-jsa-form-builder-design.md`
- Source plan: `docs/superpowers/plans/2026-07-18-jsa-and-signatures.md` — every item below maps to
  a numbered Task in that plan with the exact code to transcribe. This checklist is the tracker;
  the plan file is the source of truth for content.
- One shared table, not a parallel system: `project_swms_documents` gets a `doc_type` column
  (`'swms' | 'jsa'`). Storage bucket, RLS, and the crew-acknowledgment lifecycle are all reused
  unchanged.
- `SwmsAuthoredContent` becomes a discriminated union on `docType` — JSA adds `whoAtRisk`/
  `equipment`/`emergencyProcedures`, no risk-rating field (real AU regulator JSA templates are
  inconsistent on this; the two "keep it simple" ones — SafeWork NSW, WorkSafe Vic — skip it).
- 11 JSA hazard templates are real, sourced content (SafeWork Australia + state WorkSafe/SafeWork
  guidance, cited per template in the plan) — transcribe exactly as written, do not paraphrase.
- Signatures: one reusable, redrawable signature per user (`profiles.signature_path`, private
  `signatures` bucket), captured via a hand-rolled `<canvas>` component — no new npm dependency.
  Acknowledgment stays a single checkbox; the first time a crew member has no signature saved, the
  checkbox action opens the signature pad inline, once only.
- PDF generation for **authored** documents moves from creation-time-only to also on-demand: a new
  `GET .../swms/[documentId]/pdf` route live-renders from `content` plus a current join across
  acknowledgments + each signer's *current* saved signature, so a viewed/downloaded copy always
  reflects who's signed. This is an explicit tradeoff — the signature shown is whatever's
  currently saved, not a frozen snapshot from when they acknowledged (matches what was asked for:
  reusable, changeable).
- Uploaded (non-authored) SWMS documents are completely unaffected by any of this — "View" keeps
  serving the static uploaded file exactly as today; the app can't inject a signature block into
  an arbitrary uploaded PDF without a new PDF-editing dependency (explicitly out of scope).
- The cross-user signature read (rendering someone else's signature into a PDF) uses
  `createServiceClient()` after an explicit RLS-scoped access check on the document itself — not a
  cross-referencing RLS policy, which is exactly the pattern that caused today's `project_members`
  infinite-recursion bug (fixed as schema-107, same session).
- Two migrations: `schema-108-jsa-doc-type.sql` (name: `jsa_doc_type`) and
  `schema-109-signatures.sql` (name: `jsa_signatures`) — both conductor-only, applied via Supabase
  MCP `apply_migration`, not Codex turns.
- Part A (JSA) is independently shippable before Part B (signatures) begins.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Read every target file first — most tasks modify files that already exist and were touched
  during today's SWMS Form Builder phase (`SwmsBuilderForm.tsx`, `SwmsDocumentPdf.tsx`,
  `ProjectSwmsPanel.tsx`, the project detail page, the SWMS API route, `settings/page.tsx`).
- Transcribe the plan's code exactly — every task's "Files" and step code blocks in
  `docs/superpowers/plans/2026-07-18-jsa-and-signatures.md` are complete, real content (the 11 JSA
  templates are sourced research, not placeholders).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- A-1 and B-1 are conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`, no Codex
  dispatch for those two items.
- Commit each verified item separately.

---

## Part A — JSA document type

- [x] **A-1** — Database migration: `doc_type` column (plan Task 1). *Conductor-only, pure SQL.*
  - Write `supabase/schema-108-jsa-doc-type.sql`, apply via Supabase MCP (name: `jsa_doc_type`),
    verify column exists, commit.
- [x] **A-2** — Types: discriminated `SwmsAuthoredContent` + `JsaHazard` (plan Task 2).
  - Modify `src/types/swms.ts`.
- [ ] **A-3** — JSA hazard template library, 11 templates (plan Task 3).
  - Create `src/lib/jsa-templates.ts`.
- [ ] **A-4** — `SwmsBuilderForm.tsx` branches on docType (plan Task 4).
  - Modify `src/components/projects/SwmsBuilderForm.tsx`.
- [ ] **A-5** — `swms/new/page.tsx` reads `?type=` and derives docType (plan Task 5).
  - Modify `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`.
- [ ] **A-6** — API route accepts `doc_type` (plan Task 6).
  - Modify `src/app/api/projects/[projectId]/swms/route.ts`.
- [ ] **A-7** — `SwmsDocumentPdf.tsx` branches on docType, adds signatures section (plan Task 7).
  - Modify `src/components/projects/SwmsDocumentPdf.tsx`.
- [ ] **A-8** — Wire "+ Build JSA" entry point + unified document list (plan Task 8).
  - Modify `src/components/projects/ProjectSwmsPanel.tsx` and the project detail page
    (`src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`).
  - Manual smoke (deferred to user): build a JSA from a few templates, confirm PDF title/fields,
    confirm SWMS path unaffected, confirm both types list together correctly.

## Part B — Reusable signatures

- [ ] **B-1** — Database migration: signatures (plan Task 9). *Conductor-only, pure SQL.*
  - Write `supabase/schema-109-signatures.sql`, apply via Supabase MCP (name: `jsa_signatures`),
    verify column/bucket/policies exist, commit.
- [ ] **B-2** — `SignaturePad` component, hand-rolled canvas capture (plan Task 10).
  - Create `src/components/settings/SignaturePad.tsx`.
- [ ] **B-3** — Wire "My signature" card into Settings (plan Task 11).
  - Modify `src/app/settings/page.tsx`.
  - Manual smoke (deferred to user): draw and save a signature, confirm it persists and can be
    redrawn.
- [ ] **B-4** — Require a saved signature before first acknowledgment (plan Task 12).
  - Modify `src/components/projects/ProjectSwmsPanel.tsx` and the project detail page.
- [ ] **B-5** — On-demand signed PDF route (plan Task 13).
  - Create `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`.
- [ ] **B-6** — "View" opens live-signed PDF for authored documents (plan Task 14).
  - Modify `src/components/projects/ProjectSwmsPanel.tsx`.
  - Manual smoke (deferred to user): acknowledge with no signature saved, confirm inline prompt
    blocks until drawn; view a document with 2+ acknowledgments, confirm every name/signature/
    timestamp renders; confirm an uploaded SWMS is completely unaffected.

## Acceptance checklist
- [ ] A-1 through A-8: JSA builds from any of the 11 templates, generates a correctly-titled PDF,
  coexists cleanly with the unmodified SWMS flow, both list together in one Safety panel.
- [ ] B-1 through B-6: a user draws one reusable signature in Settings; acknowledging any SWMS/JSA
  prompts for it once if missing; viewing an authored document live-renders current signatures;
  uploaded documents are completely unaffected.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke per each item's Manual step above — user follow-up, not the conductor's to
  complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after B-6, plus the "Verification"/manual-smoke notes in
`docs/superpowers/plans/2026-07-18-jsa-and-signatures.md`.
