# Project ↔ Site Linking — Design

## Goal

Give `projects.site_id` (added in the Site Sign-In migration, currently unused by any UI) a real
way to get set — at creation time and retroactively on existing projects — so signing into a site
reliably resolves to the right project's SWMS/JSA, instead of relying on the ambiguous shared
`client_id` relationship a client with multiple sites breaks.

Raised directly by the user while smoke-testing site sign-in: "theres currently no system linking
project to site other than client id however as we know, clients can have multiple sites and the
project folder doesnt allow for that."

## Architecture

**No new tables or columns** — `projects.site_id` already exists (schema-111). This phase is
entirely UI: two places a site gets attached to a project, both scoped to that project's own
client's `client_sites` (a site belongs to exactly one client; picking a site from a different
client would be inconsistent data), both optional, both gated to `supportsMultiSite` workspace
profiles only (`builder_construction`, `trades_field_services`, `real_estate`,
`cleaning_maintenance`) — a tutoring or consulting org never sees a site field, matching how
`client_sites` itself is already gated.

## Creation-time: `ProjectForm.tsx`

A "Site" dropdown appears once a client is selected (mirrors the existing behaviour where the
form's client-scoped fields only make sense after a client is picked). Populated from
`client_sites` filtered to the selected `client_id`, re-fetched whenever the client selection
changes. Optional — defaults to none, submits `site_id: null` if left unset. If no client is
selected yet, or the selected client has zero sites, the dropdown doesn't render at all (nothing
to pick from).

## Existing projects: a new small "Site" control on the project detail page

**There is currently no general "edit project" form or page at all** — the project detail page
only has Archive/Delete actions for the whole project, no way to change name, client, due date,
budget, or (without this phase) site. Rather than build a full edit form the current feature set
doesn't otherwise need, this phase adds one small, standalone control matching the size and
pattern of the existing `ArchiveButton`/`DeleteProjectButton` components: shows the current site
if one's set, or "No site assigned" with an "Assign site" action if not; the picker is scoped to
the project's own client's sites, same constraint as creation. Manager-gated
(`canManageConfidential`), matching every other project-management control already on that page.

This is the retrofit path for every project created before this phase shipped, and for anyone who
skips the site field at creation time and wants to add it later.

## Explicitly out of scope this phase

- A general project-edit form (name/client/due-date/budget) — only the new site field gets an
  editing path, deliberately narrow rather than opening that broader scope now
- Making site required for any workspace profile — stays optional everywhere, matching how
  `client_id` itself is optional on a project
- Any change to the Site Sign-In access model (Project Crew + same-day sign-in) — this phase is
  purely about how `site_id` gets populated, not how it's consumed

## Verification

`pnpm run build` after every implementation task. Manual smoke (deferred to the user): create a
project, pick a client, confirm the site dropdown populates from that client's sites and submits
correctly; open an existing project with no site, assign one via the new control, confirm it
persists; confirm the site field is completely absent for a non-multi-site workspace profile.
