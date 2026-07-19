# SWMS/JSA In-App Reader Page

## Goal
Give SWMS/JSA documents a real in-app HTML page (mirroring the existing invoice detail page
pattern) reachable directly from the Dashboard and push notifications, with sign-in-place at the
bottom — replacing the current PDF-in-new-tab-only "View" flow. Also closes a real gap found while
tracing this code path: pre-multi-category JSA documents can crash wherever `content` is read
without the backward-compat conversion that today only exists in the edit form's loader.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-19-swms-jsa-reader-page-design.md`
- Source plan: `docs/superpowers/plans/2026-07-19-swms-jsa-reader-page.md` — 3 tasks, the exact
  code to transcribe for every file is in that plan. This checklist is the tracker; the plan file
  is the source of truth for content.
- No database migration — reuses the existing `project_swms_documents` table/columns as-is.
- Uploaded (non-authored) documents do NOT get an inline `<iframe>` embed — Android WebView (the
  Tauri Android build) generally has no built-in PDF renderer, so embedding risked a blank page.
  They get an "Open document" link (same signed-URL-in-new-tab behaviour as today) plus the Sign
  section below it, on the same new page.
- The project list's (`ProjectSwmsPanel.tsx`) inline "I've read and understood this" button is
  REMOVED as part of this phase, not kept as a shortcut — signing now only happens on the new
  document page, consolidating what were two acknowledge code paths into one. This is a deliberate
  behaviour change, not a bug if a returning user doesn't see it on the list anymore.
- Task order matters: Task 1's normalization fix must land before Task 2, since the new reader
  page (Task 2) reads the same `content` shape and would otherwise inherit the same crash risk for
  pre-multi-category JSA documents.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Transcribe the plan's code exactly — every step's Find/Replace (or full-file Create/Replace)
  block in `docs/superpowers/plans/2026-07-19-swms-jsa-reader-page.md` is complete, real content.
- If any Find block doesn't match a file's actual current content, report it as a blocker with the
  exact text searched for and what the file actually contains nearby — do not guess.

## Rules for conductor (Claude)
- `pnpm run build` after every turn — must pass before ticking the box and committing.
- No migration this phase — no conductor-only SQL item.

---

- [x] **R-1** — Fix the multi-category JSA backward-compat gap (plan Task 1, 3 files:
  `src/lib/normalize-swms-content.ts` new, `pdf/route.ts` + `swms/new/page.tsx` edited).
- [x] **R-2** — Build the reader page and its components (plan Task 2, 5 files: 3 new components,
  new `[documentId]/page.tsx`, `ProjectSwmsPanel.tsx` full-file replacement).
- [ ] **R-3** — Point the three entry points at the new page (plan Task 3, 2 files:
  `DashboardUpcoming.tsx`, `swms-notifications.ts`).
  - [ ] Manual smoke (deferred to user): open an authored SWMS/JSA from the Dashboard widget and
    confirm it lands on the document page (not the project page), content renders, Sign works,
    Edit/Delete/Download PDF work for a manager; open an uploaded document and confirm "Open
    document" + Sign both work; confirm the project list no longer shows an inline Sign button;
    if a pre-multi-category JSA still exists, confirm its View/Edit/PDF all still work.

## Acceptance checklist
- [ ] Pre-multi-category JSA content is normalized wherever `content` is read (PDF route, edit
  form, new reader page) — not just in the edit form as before.
- [ ] New route `/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]` renders authored
  SWMS/JSA content as HTML, grouped by category for JSA.
- [ ] Uploaded documents show an "Open document" link (no iframe embed) on the same page shape.
- [ ] Sign section works on the new page for both authored and uploaded documents.
- [ ] Manager header actions (Edit, Delete, Download PDF) appear correctly gated by `canManage`
  and document source.
- [ ] Project list (`ProjectSwmsPanel.tsx`) no longer has an inline Sign button; View navigates to
  the new page.
- [ ] Dashboard "Today" widget and the push notification both link directly to the document page.
- [ ] Full `pnpm run build` passes clean.
- [ ] Manual smoke — user follow-up, not the conductor's to complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint), plus the
manual-smoke notes above.
