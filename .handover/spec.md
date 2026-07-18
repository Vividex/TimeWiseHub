# Project ↔ Site Linking

## Goal
Give `projects.site_id` (added in the Site Sign-In migration, currently unused by any UI) a real
way to get set — at creation time and retroactively on existing projects — client-scoped,
optional, gated to multi-site workspace profiles.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-19-project-site-linking-design.md`
- Source plan: `docs/superpowers/plans/2026-07-19-project-site-linking.md` — every item below maps
  to a numbered Task in that plan with the exact code to transcribe. This checklist is the
  tracker; the plan file is the source of truth for content.
- No database migration — `projects.site_id` already exists (schema-111).
- A site is always scoped to the project's own client — the picker only shows sites belonging to
  whichever client is currently selected/assigned, never a different client's sites.
- Optional everywhere, matching how `client_id` itself is optional on a project. Not required for
  any workspace profile.
- Two UI surfaces: a dropdown on the existing project creation form (`ProjectForm.tsx`), and a new
  small standalone retrofit control on the project detail page for existing projects — there is no
  general project-edit form today (only Archive/Delete), so this is deliberately narrow.
- Both surfaces gated to `supportsMultiSite` workspace profiles only (`builder_construction`,
  `trades_field_services`, `real_estate`, `cleaning_maintenance`).
- The retrofit control is manager-gated (`canManageConfidential`), matching every other
  project-management control already on that page.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Read every target file first — every task modifies files that already exist
  (`ProjectForm.tsx`, `dashboard/projects/page.tsx`, the projects API route, the project detail
  page) or creates one new component.
- Transcribe the plan's code exactly — every task's "Files" and step code blocks in
  `docs/superpowers/plans/2026-07-19-project-site-linking.md` are complete, real content.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- No migration this phase — no conductor-only SQL item.
- Commit each verified item separately.

---

- [x] **PS-1** — Site picker at project creation (plan Task 1).
  - Modify `src/components/projects/ProjectForm.tsx`, `src/app/dashboard/projects/page.tsx`,
    `src/app/api/projects/route.ts`.
- [ ] **PS-2** — Retrofit control for existing projects (plan Task 2).
  - Create `src/components/projects/ProjectSiteControl.tsx`, modify the project detail page.
  - [ ] Manual smoke (deferred to user): create a project with a site, confirm it saves; assign a
    site to an existing project via the new control, confirm it persists; confirm the whole site
    UI is absent for a non-multi-site workspace profile.

## Acceptance checklist
- [ ] PS-1 through PS-2: site picker works at creation and retroactively, client-scoped, optional,
  correctly gated.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke per PS-2's Manual step above — user follow-up, not the conductor's to complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after PS-2, plus the "Verification"/manual-smoke notes in
`docs/superpowers/plans/2026-07-19-project-site-linking.md`.
