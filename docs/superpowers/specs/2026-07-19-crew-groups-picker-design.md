# Crew-Groups Picker Design

## Goal
When adding people to a project's crew, let a manager bulk-add a saved "Crew" group (from the
Crews page) alongside individual workers — today `ProjectCrewPanel` only offers a one-at-a-time
dropdown of individual org members, with no way to add a saved crew group at all.

## Background
`crews` + `crew_members` (schema-059) already exist as org-wide named groups with a designated
manager, used today for approval-workflow routing on the Crews page (`/dashboard/crews`,
`CrewManager.tsx`). They are completely disconnected from a project's own crew
(`project_members`, schema-008) — a project manager adding people has to know who's in which crew
group by memory and add them individually.

## Behavior
Adding a crew to a project is a **one-time snapshot**, not a live link:
- Fetch the selected crew's current member list.
- Filter out anyone already on the project's crew (same dedupe logic the individual picker
  already does via `availableMembers`).
- Bulk-insert the remainder as ordinary `project_members` rows — identical rows to what adding
  people one-by-one produces today.
- No new table, no "this crew is linked to this project" tracking. If the saved crew's membership
  changes later (someone joins/leaves), the project's crew list is unaffected until manually
  adjusted. Once added, a former crew member is indistinguishable from someone added
  individually — no visual grouping persists after the add.

## UI
`ProjectCrewPanel` gains a second control next to the existing one:
- Existing "Add to crew…" dropdown (individual org members not yet on the project) is unchanged.
- New "Add a crew…" dropdown, listing only saved crews that have **at least one** member not
  already on the project's crew — each option shows a count of how many members will actually be
  added, e.g. "Roofing Team (3 to add)". Crews where every member is already on the project don't
  appear (nothing to add).
- Same `canManage` gating as the existing individual-add control — both controls are
  manager/admin/owner-only, matching every other crew-management action on this page.
- Selecting a crew and clicking "Add" bulk-inserts the filtered members in one request, then
  refreshes the page. No separate loading/confirmation step beyond the existing pattern (matches
  the individual-add button's own `saving`/disabled behavior).

## Data flow
The project detail page (`clients/[id]/projects/[projectId]/page.tsx`) already fetches org
members and the project's own crew inside its `supportsSwms`-gated block — this is the only place
`ProjectCrewPanel` renders today, so this feature stays inside that same gate rather than
loosening it. One additional query is added there: all of the org's crews plus their members
(same shape as the Crews page's own fetch — `crews` joined with `crew_members`, resolved against
the already-fetched org member list for display names), mapped into a new
`CrewGroupOption[]` and passed to `ProjectCrewPanel` as a `crewGroups` prop.

## Files
- `src/types/project-crew.ts` — add `CrewGroupOption = { id: string; name: string; members: CrewMemberOption[] }`
  alongside the existing `CrewMemberOption`.
- `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx` — add the crews+members query
  inside the existing `if (supportsSwms)` block, pass `crewGroups` to `ProjectCrewPanel`.
- `src/components/projects/ProjectCrewPanel.tsx` — accept `crewGroups` prop, add the second
  dropdown + bulk-add handler.

## Testing
No test runner in this project — the gate is `pnpm run build`. Manual smoke (deferred to the
user): as a manager on a trades/construction-profile org, open a project with an empty crew,
confirm the "Add a crew…" dropdown lists real saved crews with correct to-add counts, add one and
confirm all its members appear; add a second overlapping crew and confirm only the new (non-
duplicate) members get added; confirm a crew whose members are all already on the project doesn't
appear in the dropdown at all; confirm neither control appears for a non-manager.
