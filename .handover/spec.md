# Project → Job Terminology

## Goal
Wire the already-existing but silently-unused `terminology.project` slot through the core UI so
Builder & Construction, Trades & Field Services, and Cleaning & Maintenance say "Job"/"Jobs" and
Real Estate says "Listing"/"Listings" everywhere the app currently hardcodes the literal word
"Project" — nav/page titles, buttons, back-links, tiles, panels, and one generated document.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-19-project-to-job-terminology-design.md`
- Source plan: `docs/superpowers/plans/2026-07-19-project-to-job-terminology.md` — every item below
  maps to a numbered Task in that plan with the exact code to transcribe. This checklist is the
  tracker; the plan file is the source of truth for content.
- No database migration — the `project` terminology slot already exists in the registry/types.
- Terminology values: Job/Jobs for `builder_construction`/`trades_field_services`/
  `cleaning_maintenance`; Listing/Listings for `real_estate`. Every other profile unchanged.
- URLs and database/component/variable names never change — only rendered text.
- Out of scope: the AI assistant's own reasoning/system-prompt text, notification emails, the
  help page, public marketing/landing pages, internal API routes with no rendered text.
- Real dead-code findings from the plan's own research, deliberately NOT touched by any item below:
  `ProjectCard.tsx`/`ProjectsGrid.tsx` (never imported anywhere) and `TasksHub.tsx` (never
  imported — `/dashboard/tasks` is a plain redirect stub).
- `ProjectSwmsPanel.tsx`, `ProjectCrewPanel.tsx`, `ProjectExpensesPanel.tsx`, `DocumentPanel.tsx`,
  `ProjectTaskGrid.tsx`, `ArchiveButton.tsx`, `SidebarNav.tsx`, `MobileSidebar.tsx` — checked
  directly, none render the literal word "Project", so no item touches them either.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Transcribe the plan's code exactly — every task's Find/Replace blocks in
  `docs/superpowers/plans/2026-07-19-project-to-job-terminology.md` are complete, real content.
- JT-7 modifies `src/app/dashboard/layout.tsx` a second time (JT-2 modifies it first) — its Find
  block in the plan already accounts for JT-2's change, so JT-7 must not run before JT-2 is
  merged.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- No migration this phase — no conductor-only SQL item.
- Commit each verified item separately.
- After JT-10, run the plan's Step 7 final `grep` sweep before ticking the Acceptance checklist.

---

- [x] **JT-1** — Registry: add Job/Listing terminology values (plan Task JT-1).
- [x] **JT-2** — Page title: DashboardShell + dashboard/layout.tsx (plan Task JT-2).
- [x] **JT-3** — Projects list & creation (plan Task JT-3).
- [x] **JT-4** — Project detail back-link, delete button, generated PDF (plan Task JT-4).
- [x] **JT-5** — Time tracking (plan Task JT-5).
- [x] **JT-6** — Calendar (plan Task JT-6).
- [ ] **JT-7** — Invoices/Quotes picker + AI assistant chip (plan Task JT-7).
- [ ] **JT-8** — Video scheduling (plan Task JT-8).
- [ ] **JT-9** — Dashboard tile & Insights (plan Task JT-9).
- [ ] **JT-10** — Reports export, client detail tile, billing page (plan Task JT-10).
  - [ ] Final grep sweep (plan Task JT-10 Step 7) — conductor-only, no code change expected.
  - [ ] Manual smoke (deferred to user): construction/trades org shows "Job"/"Jobs" everywhere;
    real estate org shows "Listing"/"Listings"; an unaffected profile (Consulting, or Tutoring
    which shows "Learning Plan") is unchanged.

## Acceptance checklist
- [ ] JT-1 through JT-10: every in-scope area reads from `terminology.project` instead of a
  hardcoded "Project" string.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Final grep sweep turns up nothing but variable names, URLs, and expected non-matches.
- [ ] Manual smoke per JT-10's manual-smoke item — user follow-up, not the conductor's to complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after JT-10, plus the grep sweep and manual-smoke notes in
`docs/superpowers/plans/2026-07-19-project-to-job-terminology.md`.
