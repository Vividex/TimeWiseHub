# Site Sign-In

## Goal
Let a worker sign into a job site for the day and, by doing so, gain access to that site's
SWMS/JSA safety documents even without a manager having pre-assigned them as Project Crew. Notify
everyone who should sign a newly-generated SWMS/JSA (assigned crew + anyone signed in that day)
and surface it on their Dashboard under "Today."

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-19-site-sign-in-design.md`
- Source plan: `docs/superpowers/plans/2026-07-19-site-sign-in.md` — every item below maps to a
  numbered Task in that plan with the exact code to transcribe. This checklist is the tracker;
  the plan file is the source of truth for content.
- Access-gate only, not attendance/payroll — no time-entry/timesheet integration.
- `projects.site_id` (nullable FK to `client_sites`) resolves "which project's SWMS/JSA applies
  at this site" — `client_sites` is client-scoped with no project link today.
- Site sign-in **supplements** the existing `project_members` access model, doesn't replace it —
  a worker gets SWMS/JSA access if they're Project Crew *or* signed into the site that day.
- Sign-in resets daily (Sydney calendar day), not persistent — matches the "Today" framing.
- **Timezone correctness is load-bearing**: every "signed in today" check, in SQL (RLS, table
  default) and application code, must use Sydney-local date logic
  (`(now() at time zone 'Australia/Sydney')::date` in SQL, `getTodaySydneyDateString()` in app
  code) — not bare `current_date`, which is off by roughly half a day against Sydney time.
- Dashboard sign-in widget shows the 3 most recently relevant sites (by the worker's own sign-in
  history) with a "show more" expansion — not a full flat list.
- Notification recipients on new SWMS/JSA: Project Crew + anyone signed into the site that day,
  deduplicated. Fires once, only on genuine new-document creation, not on in-place edits.
- One migration: `schema-111-site-sign-ins.sql` (name: `site_sign_ins`) — conductor-only, applied
  via Supabase MCP `apply_migration`, not a Codex turn.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Read every target file first — every task modifies files that already exist
  (`dashboard/page.tsx`, `DashboardUpcoming.tsx`, `ProjectSwmsPanel.tsx`, the project detail page,
  the SWMS API route) or creates new ones alongside them.
- Transcribe the plan's code exactly — every task's "Files" and step code blocks in
  `docs/superpowers/plans/2026-07-19-site-sign-in.md` are complete, real content.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- SS-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`, no Codex dispatch
  for that item.
- Commit each verified item separately.

---

- [x] **SS-1** — Database migration: `projects.site_id`, `site_sign_ins`, supplemental RLS on 3
  existing policies (plan Task 1). *Conductor-only, pure SQL.*
  - Write `supabase/schema-111-site-sign-ins.sql`, apply via Supabase MCP (name: `site_sign_ins`),
    verify column/table/policies exist, commit.
- [x] **SS-2** — SWMS/JSA access supplemented by site sign-in (plan Task 2).
  - Modify the project detail page and `src/components/projects/ProjectSwmsPanel.tsx`.
- [x] **SS-3** — Site sign-in widget on the Dashboard (plan Task 3).
  - Create `src/components/dashboard/SiteSignInWidget.tsx`, modify `src/app/dashboard/page.tsx`.
  - [ ] Manual smoke (deferred to user): widget shows up to 3 sites with working "show more",
    sign-in flips to "✓ Signed in", recently-used sites sort first next visit.
- [x] **SS-4** — Dashboard Today item for pending SWMS/JSA signatures (plan Task 4).
  - Create `src/lib/swms-awaiting-signature.ts`, modify `DashboardUpcoming.tsx` and
    `dashboard/page.tsx`.
- [x] **SS-5** — Notify crew + signed-in workers on new SWMS/JSA (plan Task 5).
  - Create `src/lib/swms-notifications.ts`, modify the SWMS API route.
  - [ ] Manual smoke (deferred to user): generate a JSA, confirm both Project Crew and signed-in
    workers see it on Dashboard Today (and get a push if enabled); confirm in-place edits don't
    re-notify; confirm an unrelated worker still can't see/acknowledge it.

## Acceptance checklist
- [x] SS-1 through SS-5: site sign-in supplements Project Crew access; Dashboard widget and Today
  item both work; notification fires correctly once per new document. *(compiles; manual smoke
  deferred to user, see below)*
- [x] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke per SS-3 and SS-5's Manual steps above — user follow-up, not the conductor's to
  complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after SS-5, plus the "Verification"/manual-smoke notes in
`docs/superpowers/plans/2026-07-19-site-sign-in.md`.
