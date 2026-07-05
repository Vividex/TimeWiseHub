# Dynamic Navigation Engine (Phase 4 of the Workspace Profile roadmap)

## Background

Phases 1-3 shipped the Workspace Profile engine, the setup wizard, and dynamic terminology for the
Clients section — all with a real forcing function (a schema gap, a needed gate, an actual word
mismatch a prospect would see). Phase 4 ("Dynamic Navigation... Order, Icons, Visibility,
Grouping... prepare for future drag-and-drop customisation") has no equivalent forcing function
yet — confirmed during brainstorming (2026-07-05): no real tutoring/personal-training prospect has
said which nav items they'd hide or reorder. This is still speculative.

**Scope decided, given that:** build the underlying *mechanism* now — a per-profile navigation
override that every current profile leaves empty, producing sidebar output byte-for-byte identical
to today's hardcoded `NAV_GROUPS`. This mirrors exactly how Phase 1 shipped a resolver with zero UI
consumers at first: safe, testable, zero visible behaviour change, and ready for a later phase to
fill in real per-profile decisions once actual feedback exists. Icons and drag-and-drop reordering
are explicitly **not** built — nobody has asked for icon variation, and drag-and-drop would need
its own persistence design (per-user? per-org? a new DB column?) that has no current need to
justify guessing at now.

## Scope for this phase

- Extend `WorkspaceProfileConfig` (Phase 1, `src/lib/workspace-profiles/types.ts`) with an optional
  `navOverrides` field covering exactly the three levers discussed during brainstorming: hidden
  items, group order, and item order within a group.
- A pure function that applies a (possibly absent) override to the existing `NAV_GROUPS` constant,
  producing the final render list.
- Thread the resolved override through `dashboard/layout.tsx` → `DashboardShell` → `MobileSidebar`
  → `SidebarNav`, the same prop-threading pattern already used for `clientLabel`.
- Every registry entry (all ten profiles) gets no `navOverrides` (or an empty one) — this phase
  ships no actual per-profile difference, only the capability.
- **Explicitly out of scope:** deciding what any real profile should actually hide/reorder; icons;
  drag-and-drop UI or its persistence; regrouping items into different group titles (only
  reordering existing groups/items, not moving an item from one group to another — no current need
  demonstrated for that either, and it's a materially more complex data model).

## Architecture

**Type (`src/lib/workspace-profiles/types.ts`):**

```typescript
export type NavOverrides = {
  hiddenHrefs?: string[]
  groupOrder?: string[]
  itemOrder?: Record<string, string[]>
}
```

- `hiddenHrefs`: hrefs to exclude from render entirely.
- `groupOrder`: full or partial list of group titles in desired order; any group title not listed
  keeps its original relative position, appended after the ones that are listed.
- `itemOrder`: keyed by group title, an ordered list of hrefs within that group; any href not
  listed keeps its original relative position within the group, appended after the ones that are
  listed.

`WorkspaceProfileConfig` gains `navOverrides?: NavOverrides` (optional — omitted entirely means "no
change from default," which is what every current profile does).

**Applying the override (`src/components/nav/SidebarNav.tsx`):** a pure function
`applyNavOverrides(groups: NavGroup[], overrides?: NavOverrides): NavGroup[]` that:
1. Returns `groups` unchanged if `overrides` is `undefined` — the identity case, exercised by every
   profile today.
2. Otherwise: filters out any item whose `href` is in `hiddenHrefs`, reorders groups per
   `groupOrder` (unlisted groups appended in original order), reorders each group's items per
   `itemOrder[group.title]` (unlisted items appended in original order within that group). A group
   left with zero items after filtering is dropped entirely, not rendered as an empty header —
   avoids a dangling section title with nothing under it.

This function is pure (no React, no hooks) and independently testable by calling it directly with
a sample `NAV_GROUPS`-shaped array and a few override combinations.

**Data flow:** identical pattern to `clientLabel`. `dashboard/layout.tsx` already calls
`getWorkspaceProfileForUser()` — it additionally reads `.navOverrides` off the same result and
passes it down through `DashboardShell` → `MobileSidebar` → `SidebarNav`, which calls
`applyNavOverrides(NAV_GROUPS, navOverrides)` once at the top of its render and maps over the
result instead of `NAV_GROUPS` directly.

## Out of scope (explicitly deferred)

- Any actual per-profile hidden/reordered items — the registry ships this phase with every profile
  producing identical output to today.
- Icons varying per profile.
- Drag-and-drop customisation (roadmap doc's own stated end-state for this phase) — no persistence
  model designed, no UI built.
- Moving an item from one group to a different group ("regrouping" in the fullest sense) — only
  reordering within the existing group structure.

## Verification

No test runner in this project — verification is `pnpm run build` plus:
1. A one-off manual check that `applyNavOverrides(NAV_GROUPS, undefined)` returns the exact same
   structure as `NAV_GROUPS` (the identity path every current profile takes).
2. A one-off manual check with a synthetic override (e.g. hide one item, reorder two) confirming
   the three levers behave as designed, run via a throwaway script (not committed), same pattern
   used to verify Phase 1's resolver.
3. Manual browser smoke: confirm the sidebar renders identically to before this phase for the real
   account (since its profile has no `navOverrides`), across both desktop and mobile nav.
