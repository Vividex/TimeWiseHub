# Dynamic Navigation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Build the per-profile navigation override mechanism (hidden items, group order, item
order) with zero visible change today — every current profile has no override, so the sidebar
renders identically to before this phase.

**Architecture:** `WorkspaceProfileConfig` gains an optional `navOverrides` field. A pure function
`applyNavOverrides()` in `SidebarNav.tsx` applies it (or does nothing, if absent) to the existing
`NAV_GROUPS` constant before rendering. The resolved override is threaded down the same
`dashboard/layout.tsx` → `DashboardShell` → `MobileSidebar` → `SidebarNav` path already used for
`clientLabel`.

**Tech Stack:** Next.js 16 / TypeScript strict / React — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` plus manual browser testing.
- Every registry entry ships this phase with no `navOverrides` — zero visible behaviour change.
- Icons and drag-and-drop are explicitly out of scope — no task for either.
- A group left with zero items after hiding is dropped entirely, not rendered as an empty header.
- Source spec: `docs/superpowers/specs/2026-07-05-dynamic-navigation-engine-design.md`.

---

### Task 1: `NavOverrides` type

**Files:**
- Modify: `src/lib/workspace-profiles/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NavOverrides = { hiddenHrefs?: string[]; groupOrder?: string[]; itemOrder?:
  Record<string, string[]> }`, and `WorkspaceProfileConfig` gains `navOverrides?: NavOverrides`.
  Task 2's `applyNavOverrides()` function and the prop-threading chain both depend on this exact
  shape. No change to `src/lib/workspace-profiles/registry.ts` is needed — `navOverrides` is
  optional and every entry simply omits it, which is exactly "no override."

- [ ] **Step 1: Edit `src/lib/workspace-profiles/types.ts`** — add this new type anywhere after
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

- [ ] **Step 2: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS clean — `navOverrides` is optional and no registry entry sets it, so
`WORKSPACE_PROFILES`'s existing literal object entries remain valid without any changes to
`registry.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workspace-profiles/types.ts
git commit -m "feat: dynamic navigation — NavOverrides type"
```

---

### Task 2: `applyNavOverrides` and prop threading

**Files:**
- Modify: `src/components/nav/SidebarNav.tsx`
- Modify: `src/components/nav/MobileSidebar.tsx`
- Modify: `src/components/DashboardShell.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `NavOverrides` from `src/lib/workspace-profiles/types.ts` (Task 1);
  `getWorkspaceProfileForUser` from `src/lib/workspace-profiles/resolve.ts` (Phase 1, unchanged
  signature — its return value now also carries `navOverrides` thanks to Task 1's type change).
- Produces: nothing for later tasks — this is the last task in the plan.

- [ ] **Step 1: Edit `src/components/nav/SidebarNav.tsx`**

  Add the type import alongside the existing lucide-react import block:
  ```typescript
  import type { NavOverrides } from '@/lib/workspace-profiles/types'
  ```

  Add these two functions after the `NavGroup`/`NavItem` type definitions (before `NAV_GROUPS`):
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

  Change the component signature:
  ```typescript
  export default function SidebarNav({
    email,
    clientLabel,
  }: {
    email: string
    clientLabel: { singular: string; plural: string }
  }) {
  ```
  to:
  ```typescript
  export default function SidebarNav({
    email,
    clientLabel,
    navOverrides,
  }: {
    email: string
    clientLabel: { singular: string; plural: string }
    navOverrides?: NavOverrides
  }) {
  ```

  Change:
  ```typescript
      <nav className="space-y-0.5">
        {NAV_GROUPS.map(group => (
  ```
  to:
  ```typescript
      <nav className="space-y-0.5">
        {applyNavOverrides(NAV_GROUPS, navOverrides).map(group => (
  ```

- [ ] **Step 2: Edit `src/components/nav/MobileSidebar.tsx`**

  Add the type import:
  ```typescript
  import type { NavOverrides } from '@/lib/workspace-profiles/types'
  ```
  Change:
  ```typescript
  export default function MobileSidebar({ email, clientLabel }: { email: string; clientLabel: { singular: string; plural: string } }) {
  ```
  to:
  ```typescript
  export default function MobileSidebar({ email, clientLabel, navOverrides }: { email: string; clientLabel: { singular: string; plural: string }; navOverrides?: NavOverrides }) {
  ```
  Change:
  ```typescript
            <SidebarNav email={email} clientLabel={clientLabel} />
  ```
  to:
  ```typescript
            <SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />
  ```

- [ ] **Step 3: Edit `src/components/DashboardShell.tsx`**

  Add the type import:
  ```typescript
  import type { NavOverrides } from '@/lib/workspace-profiles/types'
  ```
  Change:
  ```typescript
  export default function DashboardShell({
    children,
    email,
    clientLabel,
  }: {
    children: React.ReactNode
    email: string
    clientLabel: { singular: string; plural: string }
  }) {
  ```
  to:
  ```typescript
  export default function DashboardShell({
    children,
    email,
    clientLabel,
    navOverrides,
  }: {
    children: React.ReactNode
    email: string
    clientLabel: { singular: string; plural: string }
    navOverrides?: NavOverrides
  }) {
  ```
  Change `<SidebarNav email={email} clientLabel={clientLabel} />` to
  `<SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />`.
  Change `<MobileSidebar email={email} clientLabel={clientLabel} />` to
  `<MobileSidebar email={email} clientLabel={clientLabel} navOverrides={navOverrides} />`.

- [ ] **Step 4: Edit `src/app/dashboard/layout.tsx`**

  Change:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  to:
  ```typescript
    const { terminology, navOverrides } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
          <DashboardShell email={user.email ?? ''} clientLabel={terminology.client}>
  ```
  to:
  ```typescript
          <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} navOverrides={navOverrides}>
  ```

- [ ] **Step 5: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 6: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 7: One-off functional verification (not committed)**

No test runner exists, and every current profile has `navOverrides` undefined, so prove the
function's logic works with a throwaway script (scratchpad only, run via `npx tsx` from inside the
project directory so `node_modules` resolves — same technique used to verify Phase 1's resolver):

```typescript
// scratchpad-only verification, not committed
type NavItem = { label: string; href: string }
type NavGroup = { title: string; items: NavItem[] }
type NavOverrides = { hiddenHrefs?: string[]; groupOrder?: string[]; itemOrder?: Record<string, string[]> }

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

const sample: NavGroup[] = [
  { title: 'Home', items: [{ label: 'Home', href: '/dashboard' }] },
  { title: 'Delivery', items: [
    { label: 'Clients', href: '/dashboard/clients' },
    { label: 'Programs', href: '/dashboard/programs' },
    { label: 'Calendar', href: '/dashboard/calendar' },
    { label: 'Time', href: '/dashboard/time' },
  ] },
  { title: 'Money', items: [{ label: 'Invoices', href: '/dashboard/invoices' }] },
]

console.log('IDENTITY (expect unchanged):', JSON.stringify(applyNavOverrides(sample, undefined)) === JSON.stringify(sample))

const overridden = applyNavOverrides(sample, {
  hiddenHrefs: ['/dashboard/programs'],
  groupOrder: ['Money', 'Home'],
  itemOrder: { Delivery: ['/dashboard/time', '/dashboard/clients'] },
})
console.log('Group order (expect Money, Home, Delivery):', overridden.map(g => g.title).join(', '))
console.log('Delivery items (expect Time, Clients, Calendar):', overridden.find(g => g.title === 'Delivery')?.items.map(i => i.label).join(', '))

const allHidden = applyNavOverrides(sample, { hiddenHrefs: ['/dashboard/invoices'] })
console.log('Money group dropped (expect false — no Money in output):', allHidden.some(g => g.title === 'Money'))
```

Expected output:
```
IDENTITY (expect unchanged): true
Group order (expect Money, Home, Delivery): Money, Home, Delivery
Delivery items (expect Time, Clients, Calendar): Time, Clients, Calendar
Money group dropped (expect false — no Money in output): false
```

Delete the script after running — it must not be committed.

- [ ] **Step 8: Manual smoke test**

Confirm the sidebar (desktop and mobile) renders identically to before this phase for the real
account — its profile has no `navOverrides`, so nothing should look different.

- [ ] **Step 9: Commit**

```bash
git add src/components/nav/SidebarNav.tsx src/components/nav/MobileSidebar.tsx src/components/DashboardShell.tsx src/app/dashboard/layout.tsx
git commit -m "feat: dynamic navigation — applyNavOverrides and prop threading"
```

---

## Self-Review Notes

- **Spec coverage:** the `NavOverrides` type (Task 1) and the `applyNavOverrides` function plus
  full prop-threading chain (Task 2) cover everything in the spec. The spec's "out of scope" list
  (actual per-profile content, icons, drag-and-drop, cross-group regrouping) has no task,
  correctly.
- **Placeholder scan:** none — every step has complete code or an exact line-level edit.
- **Type consistency:** `NavOverrides` (Task 1) is imported and used identically in
  `SidebarNav.tsx`, `MobileSidebar.tsx`, and `DashboardShell.tsx` (Task 2); the `navOverrides`
  prop name and optional `?` are consistent at every link in the chain from `dashboard/layout.tsx`
  down to `SidebarNav`.
