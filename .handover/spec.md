# Dynamic Navigation Engine

## Goal
Build the per-profile navigation override mechanism (hidden items, group order, item order) with
zero visible change today — every current profile has no override, so the sidebar renders
identically to before this phase. Phase 4 of the Workspace Profile roadmap.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-dynamic-navigation-engine-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-dynamic-navigation-engine.md`
- No real signal yet for what any profile should actually hide or reorder (confirmed during
  brainstorming) — this phase builds only the mechanism, mirroring how Phase 1 shipped a resolver
  with zero UI consumers at first. Every registry entry ships with no `navOverrides`.
- Icons and drag-and-drop are explicitly out of scope — no task for either, no persistence model
  designed for drag-and-drop.
- A group left with zero items after hiding is dropped entirely, not rendered as an empty header.
- `applyNavOverrides()` is a pure function (no React, no hooks) — independently verifiable via a
  throwaway script, same technique used for Phase 1's resolver.
- Prop threading follows the exact same chain already used for `clientLabel`:
  `dashboard/layout.tsx` → `DashboardShell` → `MobileSidebar` → `SidebarNav`.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- No DB migration this phase.
- Task 2's functional verification is a throwaway `npx tsx` script (conductor-only, never
  committed), same pattern as Phase 1's resolver verification.

---

## C-1 — NavOverrides type

*Codex edits:*
- [x] Edit `src/lib/workspace-profiles/types.ts` — add this new type anywhere after
  `TerminologyEntry`/`Terminology` and before `WorkspaceProfileConfig`:
  ```typescript
  export type NavOverrides = {
    hiddenHrefs?: string[]
    groupOrder?: string[]
    itemOrder?: Record<string, string[]>
  }
  ```
  Then change:
  ```typescript
  export type WorkspaceProfileConfig = {
    key: WorkspaceProfileKey
    label: string
    terminology: Terminology
  }
  ```
  to:
  ```typescript
  export type WorkspaceProfileConfig = {
    key: WorkspaceProfileKey
    label: string
    terminology: Terminology
    navOverrides?: NavOverrides
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. `navOverrides` is optional and no registry entry sets
  it, so `registry.ts` needs no changes.
- [x] Commit: `git add src/lib/workspace-profiles/types.ts && git commit -m "feat: dynamic navigation — NavOverrides type"`

---

## C-2 — applyNavOverrides and prop threading

*Codex edits:*
- [ ] Edit `src/components/nav/SidebarNav.tsx`:
  - Add import `import type { NavOverrides } from '@/lib/workspace-profiles/types'`.
  - Add these two functions after the `NavGroup`/`NavItem` type definitions (before `NAV_GROUPS`):
    ```typescript
    function reorderByKeys<T>(list: T[], order: string[] | undefined, keyOf: (item: T) => string): T[] {
      if (!order || order.length === 0) return list
      const byKey = new Map(list.map(item => [keyOf(item), item]))
      const ordered: T[] = []
      for (const key of order) {
        const item = byKey.get(key)
        if (item) { ordered.push(item); byKey.delete(key) }
      }
      for (const item of list) {
        if (byKey.has(keyOf(item))) { ordered.push(item); byKey.delete(keyOf(item)) }
      }
      return ordered
    }

    function applyNavOverrides(groups: NavGroup[], overrides?: NavOverrides): NavGroup[] {
      if (!overrides) return groups

      const hiddenHrefs = new Set(overrides.hiddenHrefs ?? [])
      const visible = groups
        .map(group => ({ ...group, items: group.items.filter(item => !hiddenHrefs.has(item.href)) }))
        .filter(group => group.items.length > 0)

      const reorderedGroups = reorderByKeys(visible, overrides.groupOrder, g => g.title)

      return reorderedGroups.map(group => {
        const order = overrides.itemOrder?.[group.title]
        if (!order) return group
        return { ...group, items: reorderByKeys(group.items, order, item => item.href) }
      })
    }
    ```
  - Change the component signature to accept and destructure a new optional `navOverrides?:
    NavOverrides` prop (alongside `email`/`clientLabel`).
  - Change `{NAV_GROUPS.map(group => (` to `{applyNavOverrides(NAV_GROUPS, navOverrides).map(group => (`.
- [ ] Edit `src/components/nav/MobileSidebar.tsx`:
  - Add import `import type { NavOverrides } from '@/lib/workspace-profiles/types'`.
  - Add `navOverrides?: NavOverrides` to the props destructuring/type.
  - Change `<SidebarNav email={email} clientLabel={clientLabel} />` to `<SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />`.
- [ ] Edit `src/components/DashboardShell.tsx`:
  - Add import `import type { NavOverrides } from '@/lib/workspace-profiles/types'`.
  - Add `navOverrides?: NavOverrides` to the props destructuring/type.
  - Change `<SidebarNav email={email} clientLabel={clientLabel} />` to `<SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />`.
  - Change `<MobileSidebar email={email} clientLabel={clientLabel} />` to `<MobileSidebar email={email} clientLabel={clientLabel} navOverrides={navOverrides} />`.
- [ ] Edit `src/app/dashboard/layout.tsx`:
  - Change `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)` to `const { terminology, navOverrides } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `<DashboardShell email={user.email ?? ''} clientLabel={terminology.client}>` to `<DashboardShell email={user.email ?? ''} clientLabel={terminology.client} navOverrides={navOverrides}>`.
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] One-off functional verification (not committed): throwaway `npx tsx` script (scratchpad,
  never committed) proving `applyNavOverrides(groups, undefined)` is the identity, and a synthetic
  override correctly hides an item, reorders groups, reorders items within a group, and drops a
  group left with zero items.
- [ ] Manual smoke test: confirm the sidebar (desktop and mobile) renders identically to before
  this phase for the real account.
- [ ] Commit: `git add src/components/nav/SidebarNav.tsx src/components/nav/MobileSidebar.tsx src/components/DashboardShell.tsx src/app/dashboard/layout.tsx && git commit -m "feat: dynamic navigation — applyNavOverrides and prop threading"`

---

## Acceptance checklist
- [x] C-1: `NavOverrides` type shipped, `WorkspaceProfileConfig` extended, build passes
- [ ] C-2: `applyNavOverrides` implemented and verified (identity + synthetic override cases),
  prop threading complete, manual smoke confirms zero visible change for the real account

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — `applyNavOverrides` verified via a throwaway `npx tsx` script (conductor-only,
never committed), manual browser smoke for the prop-threading chain.
