# Project → Job Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Builder & Construction, Trades & Field Services, and Cleaning & Maintenance the
word "Job" and Real Estate the word "Listing" everywhere the core UI currently hardcodes the
literal word "Project" — nav/page titles, buttons, back-links, tiles, panels, and one generated
document — without touching URLs, database/component/variable names, the AI assistant's own
reasoning, notification emails, the help page, or public marketing pages.

**Architecture:** Extends the exact pattern already used for `client`/`session`/`program`
terminology across 14 files: each server page calls `getWorkspaceProfileForUser(supabase,
user.id)`, pulls `terminology.project` (a `{ singular, plural }` pair), and passes it down as a
prop to whichever component renders the word. No new abstraction (no Context/hook) — matches this
codebase's established no-lib-layer-wrapper convention.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, no new npm dependencies.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- No database migration — `TerminologyKey`/`WORKSPACE_PROFILES` already support a `project` slot.
- Terminology values: `builder_construction`, `trades_field_services`, `cleaning_maintenance` →
  Job/Jobs. `real_estate` → Listing/Listings. Every other profile is unchanged (Tutoring already
  has Learning Plan/Learning Plans, Personal Training already has Package/Packages — both were
  silently dead until this phase wires the consuming side up; Generic/Consulting/Healthcare/
  Creative Agencies keep Project/Projects).
- URLs never change (`/dashboard/projects` stays `/dashboard/projects`). Database/component/
  variable names never change (`projects` table, `ProjectForm.tsx`, `project_id` columns, etc.).
  Only literal rendered text changes.
- Out of scope this phase: the AI assistant's own reasoning/system-prompt text, notification
  emails, the help page, public marketing/landing pages, internal API routes with no rendered
  text.
- Two real dead-code findings from this plan's own file research, excluded from every task below
  (not touched, not "fixed" — out of scope, noted for the record only):
  `src/components/projects/ProjectCard.tsx` and `src/components/projects/ProjectsGrid.tsx` are
  never imported anywhere in the app; `src/components/tasks/TasksHub.tsx` (and its own literal
  "Project" field label) is never imported either — `/dashboard/tasks` is a plain
  `redirect('/dashboard')` stub, not a real page.
- Real spec-vs-reality correction: the spec's "Project detail sub-panels" area assumed
  `ProjectSwmsPanel.tsx`, `ProjectCrewPanel.tsx`, `ProjectExpensesPanel.tsx`, `DocumentPanel.tsx`,
  and `ProjectTaskGrid.tsx` each needed edits — a grep of every one during this plan's research
  found none of them render the literal word "Project" (their headings are "Tasks"/"Expenses"/
  generic, only component/type/prop names contain the word) — no task below touches them. Same
  for `ArchiveButton.tsx`. Similarly, `SidebarNav.tsx`/`MobileSidebar.tsx` do not need a
  `projectLabel` prop at all — there is no "Projects" nav link in `NAV_GROUPS`/`BOTTOM_ITEMS`
  today (Projects are reached via a client's own Projects tab, not top-level nav).
- Source spec: `docs/superpowers/specs/2026-07-19-project-to-job-terminology-design.md`.

---

### Task JT-1: Registry — Job/Listing terminology values

**Files:**
- Modify: `src/lib/workspace-profiles/registry.ts`

**Interfaces:**
- Consumes: `Terminology` type (existing, from `./types`).
- Produces: `WORKSPACE_PROFILES[key].terminology.project` now resolves to `{Job,Jobs}` for the
  three trades-ish profiles, `{Listing,Listings}` for Real Estate. Every task below reads this at
  runtime through `getWorkspaceProfileForUser` — no other task depends on this task's internal
  code shape, only its runtime output.

- [ ] **Step 1: Add two new terminology constants**

Find:
```typescript
const GENERIC_TERMINOLOGY: Terminology = {
  client: { singular: 'Client', plural: 'Clients' },
  session: { singular: 'Session', plural: 'Sessions' },
  program: { singular: 'Program', plural: 'Programs' },
  project: { singular: 'Project', plural: 'Projects' },
}

const HIDE_SUBJECTS_NAV = { hiddenHrefs: ['/dashboard/subjects', '/dashboard/students'] }
```
Replace with:
```typescript
const GENERIC_TERMINOLOGY: Terminology = {
  client: { singular: 'Client', plural: 'Clients' },
  session: { singular: 'Session', plural: 'Sessions' },
  program: { singular: 'Program', plural: 'Programs' },
  project: { singular: 'Project', plural: 'Projects' },
}

const TRADES_TERMINOLOGY: Terminology = { ...GENERIC_TERMINOLOGY, project: { singular: 'Job', plural: 'Jobs' } }
const REAL_ESTATE_TERMINOLOGY: Terminology = { ...GENERIC_TERMINOLOGY, project: { singular: 'Listing', plural: 'Listings' } }

const HIDE_SUBJECTS_NAV = { hiddenHrefs: ['/dashboard/subjects', '/dashboard/students'] }
```

- [ ] **Step 2: Use the new constants on the four affected profiles**

Find:
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
```
Replace with:
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: REAL_ESTATE_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean. (Nothing consumes `terminology.project` yet, so this is a safe no-visible-effect change on its own — every later task depends on it being merged first.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/workspace-profiles/registry.ts
git commit -m "handover: JT-1 add Job/Listing terminology values to registry"
```

---

### Task JT-2: Page title — DashboardShell + dashboard/layout.tsx

**Files:**
- Modify: `src/components/DashboardShell.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `DashboardShell` gains a `projectLabel: { singular: string; plural: string }` prop,
  used by its internal `getTitle()` so the page header on `/dashboard/projects` and
  `/dashboard/clients/[id]/projects/[projectId]` says "Jobs"/"Job" (or "Listings"/"Listing") for
  the four affected profiles.

- [ ] **Step 1: Modify `src/components/DashboardShell.tsx`**

Find:
```typescript
function getTitle(
  pathname: string,
  clientLabel: { singular: string; plural: string },
  programLabel: { singular: string; plural: string },
) {
  if (pathname.includes('/projects/')) return 'Project'
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return 'Projects'
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname === '/dashboard/clients') return clientLabel.plural
  if (pathname.startsWith('/dashboard/clients/')) return clientLabel.singular
  if (pathname === '/dashboard/programs') return programLabel.plural
  if (pathname.startsWith('/dashboard/programs/')) return programLabel.singular
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}
```
Replace with:
```typescript
function getTitle(
  pathname: string,
  clientLabel: { singular: string; plural: string },
  programLabel: { singular: string; plural: string },
  projectLabel: { singular: string; plural: string },
) {
  if (pathname.includes('/projects/')) return projectLabel.singular
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return projectLabel.plural
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname === '/dashboard/clients') return clientLabel.plural
  if (pathname.startsWith('/dashboard/clients/')) return clientLabel.singular
  if (pathname === '/dashboard/programs') return programLabel.plural
  if (pathname.startsWith('/dashboard/programs/')) return programLabel.singular
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}
```

Find:
```typescript
export default function DashboardShell({
  children,
  email,
  clientLabel,
  programLabel,
  navOverrides,
}: {
  children: React.ReactNode
  email: string
  clientLabel: { singular: string; plural: string }
  programLabel: { singular: string; plural: string }
  navOverrides?: NavOverrides
}) {
  const pathname = usePathname()
  const title = getTitle(pathname, clientLabel, programLabel)
```
Replace with:
```typescript
export default function DashboardShell({
  children,
  email,
  clientLabel,
  programLabel,
  projectLabel,
  navOverrides,
}: {
  children: React.ReactNode
  email: string
  clientLabel: { singular: string; plural: string }
  programLabel: { singular: string; plural: string }
  projectLabel: { singular: string; plural: string }
  navOverrides?: NavOverrides
}) {
  const pathname = usePathname()
  const title = getTitle(pathname, clientLabel, programLabel, projectLabel)
```

(`SidebarNav`/`MobileSidebar` do not need a `projectLabel` prop — there is no "Projects" entry in
`NAV_GROUPS`/`BOTTOM_ITEMS` at all; Projects are reached via a client's own Projects tab, not a
top-level nav link. Only the page-title header needs the new label.)

- [ ] **Step 2: Modify `src/app/dashboard/layout.tsx`**

Find:
```typescript
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} navOverrides={navOverrides}>
```
Replace with:
```typescript
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} projectLabel={terminology.project} navOverrides={navOverrides}>
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardShell.tsx src/app/dashboard/layout.tsx
git commit -m "handover: JT-2 wire projectLabel into the page-title header"
```

---

### Task JT-3: Projects list & creation

**Files:**
- Modify: `src/app/dashboard/projects/page.tsx`
- Modify: `src/components/projects/ProjectForm.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/page.tsx`
- Modify: `src/components/projects/NewClientProjectButton.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `ProjectForm` and `NewClientProjectButton` each gain a
  `projectLabel: { singular: string; plural: string }` prop.

- [ ] **Step 1: Modify `src/app/dashboard/projects/page.tsx`**

Find:
```typescript
  const subscription = await getSubscription(user.id)
  const limitRaw = maxActiveProjects(subscription)
  const limit = isFinite(limitRaw) ? limitRaw : null
  const { supportsMultiSite } = await getWorkspaceProfileForUser(supabase, user.id)
```
Replace with:
```typescript
  const subscription = await getSubscription(user.id)
  const limitRaw = maxActiveProjects(subscription)
  const limit = isFinite(limitRaw) ? limitRaw : null
  const { supportsMultiSite, terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Active projects</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeCount} active{limit !== null ? ` / ${limit} max` : ''}
            </p>
          </div>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">
            View clients →
          </Link>
        </div>

        <ProjectForm userId={user.id} orgId={orgId} activeProjectCount={activeCount} activeProjectLimit={limit} supportsMultiSite={!!supportsMultiSite} />
```
Replace with:
```tsx
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Active {terminology.project.plural.toLowerCase()}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeCount} active{limit !== null ? ` / ${limit} max` : ''}
            </p>
          </div>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">
            View clients →
          </Link>
        </div>

        <ProjectForm userId={user.id} orgId={orgId} activeProjectCount={activeCount} activeProjectLimit={limit} supportsMultiSite={!!supportsMultiSite} projectLabel={terminology.project} />
```

Find:
```tsx
        <TileGrid empty="No active projects yet. Create one above or start from a client.">
```
Replace with:
```tsx
        <TileGrid empty={`No active ${terminology.project.plural.toLowerCase()} yet. Create one above or start from a client.`}>
```

- [ ] **Step 2: Modify `src/components/projects/ProjectForm.tsx`**

Find:
```typescript
export default function ProjectForm({
  userId,
  orgId,
  activeProjectCount,
  activeProjectLimit,
  supportsMultiSite,
}: {
  userId: string
  orgId: string | null
  activeProjectCount: number
  activeProjectLimit: number | null
  supportsMultiSite: boolean
}) {
```
Replace with:
```typescript
export default function ProjectForm({
  userId,
  orgId,
  activeProjectCount,
  activeProjectLimit,
  supportsMultiSite,
  projectLabel,
}: {
  userId: string
  orgId: string | null
  activeProjectCount: number
  activeProjectLimit: number | null
  supportsMultiSite: boolean
  projectLabel: { singular: string; plural: string }
}) {
```

Find:
```typescript
    if (blocked) {
      setError(`Free plan is limited to ${activeProjectLimit} active projects.`)
      setLoading(false)
      return
    }
```
Replace with:
```typescript
    if (blocked) {
      setError(`Free plan is limited to ${activeProjectLimit} active ${projectLabel.plural.toLowerCase()}.`)
      setLoading(false)
      return
    }
```

Find:
```typescript
    if (!res.ok) { setError(result.error ?? 'Could not create project'); setLoading(false); return }
```
Replace with:
```typescript
    if (!res.ok) { setError(result.error ?? `Could not create ${projectLabel.singular.toLowerCase()}`); setLoading(false); return }
```

Find:
```tsx
      <button onClick={() => setOpen(o => !o)} disabled={blocked} className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {open ? 'Cancel' : '+ New project'}
      </button>
      {atProjectLimit && (
        <p className="mt-3 text-sm font-semibold text-amber-600">
          Free plan limit reached: {activeProjectLimit} active projects. Archive a project or upgrade to Pro.
        </p>
      )}
```
Replace with:
```tsx
      <button onClick={() => setOpen(o => !o)} disabled={blocked} className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {open ? 'Cancel' : `+ New ${projectLabel.singular.toLowerCase()}`}
      </button>
      {atProjectLimit && (
        <p className="mt-3 text-sm font-semibold text-amber-600">
          Free plan limit reached: {activeProjectLimit} active {projectLabel.plural.toLowerCase()}. Archive a {projectLabel.singular.toLowerCase()} or upgrade to Pro.
        </p>
      )}
```

Find:
```tsx
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Project name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Website Redesign"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What is this project about?"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
```
Replace with:
```tsx
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">{projectLabel.singular} name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Website Redesign"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder={`What is this ${projectLabel.singular.toLowerCase()} about?`}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
```

Find:
```tsx
          <button type="submit" disabled={loading}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}
    </div>
  )
}
```
Replace with:
```tsx
          <button type="submit" disabled={loading}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? 'Creating…' : `Create ${projectLabel.singular.toLowerCase()}`}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Modify `src/app/dashboard/clients/[id]/projects/page.tsx`**

Find:
```tsx
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Projects</h1>

        <NewClientProjectButton clientId={id} orgId={orgId} />

        <TileGrid empty={`No projects yet for this ${terminology.client.singular.toLowerCase()}.`}>
```
Replace with:
```tsx
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{terminology.project.plural}</h1>

        <NewClientProjectButton clientId={id} orgId={orgId} projectLabel={terminology.project} />

        <TileGrid empty={`No ${terminology.project.plural.toLowerCase()} yet for this ${terminology.client.singular.toLowerCase()}.`}>
```

- [ ] **Step 4: Modify `src/components/projects/NewClientProjectButton.tsx`**

Find:
```typescript
export default function NewClientProjectButton({
  clientId,
  orgId,
}: {
  clientId: string
  orgId: string | null
}) {
```
Replace with:
```typescript
export default function NewClientProjectButton({
  clientId,
  orgId,
  projectLabel,
}: {
  clientId: string
  orgId: string | null
  projectLabel: { singular: string; plural: string }
}) {
```

Find:
```typescript
    if (!res.ok) { setError(result.error ?? 'Could not create project'); return }
```
Replace with:
```typescript
    if (!res.ok) { setError(result.error ?? `Could not create ${projectLabel.singular.toLowerCase()}`); return }
```

Find:
```tsx
        {open ? 'Cancel' : '+ New project'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Project name</label>
```
Replace with:
```tsx
        {open ? 'Cancel' : `+ New ${projectLabel.singular.toLowerCase()}`}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">{projectLabel.singular} name</label>
```

Find:
```tsx
            {loading ? 'Creating…' : 'Create project'}
```
Replace with:
```tsx
            {loading ? 'Creating…' : `Create ${projectLabel.singular.toLowerCase()}`}
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/projects/page.tsx src/components/projects/ProjectForm.tsx "src/app/dashboard/clients/[id]/projects/page.tsx" src/components/projects/NewClientProjectButton.tsx
git commit -m "handover: JT-3 project-to-job wording on the list and creation surfaces"
```

---

### Task JT-4: Project detail back-link, delete button, generated PDF

**Files:**
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`
- Modify: `src/components/projects/DeleteProjectButton.tsx`
- Modify: `src/components/projects/SwmsDocumentPdf.tsx`
- Modify: `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `DeleteProjectButton` gains a `projectLabel` prop; `SwmsDocumentPdf` gains a
  `projectLabel: string` prop (singular only — it's a single fixed field label on a PDF page).

- [ ] **Step 1: Modify `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`**

Find:
```typescript
  const { supportsSwms, supportsMultiSite } = await getWorkspaceProfileForUser(supabase, user.id)
```
Replace with:
```typescript
  const { supportsSwms, supportsMultiSite, terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
        <Link href={`/dashboard/clients/${id}/projects`} className="text-sm font-semibold text-cyan-600 hover:underline">← Projects</Link>
```
Replace with:
```tsx
        <Link href={`/dashboard/clients/${id}/projects`} className="text-sm font-semibold text-cyan-600 hover:underline">← {terminology.project.plural}</Link>
```

Find:
```tsx
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
              <DeleteProjectButton projectId={project.id} clientId={id} />
```
Replace with:
```tsx
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
              <DeleteProjectButton projectId={project.id} clientId={id} projectLabel={terminology.project} />
```

- [ ] **Step 2: Modify `src/components/projects/DeleteProjectButton.tsx`**

Find:
```typescript
export default function DeleteProjectButton({ projectId, clientId }: { projectId: string; clientId: string }) {
```
Replace with:
```typescript
export default function DeleteProjectButton({ projectId, clientId, projectLabel }: { projectId: string; clientId: string; projectLabel: { singular: string; plural: string } }) {
```

Find:
```tsx
        className="rounded-xl border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-500 hover:bg-red-50 active:scale-[0.965] disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Delete project
      </button>
      <ConfirmDialog
        open={open}
        title="Delete project?"
        message="This will permanently delete the project and cannot be undone."
        confirmLabel="Delete"
```
Replace with:
```tsx
        className="rounded-xl border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-500 hover:bg-red-50 active:scale-[0.965] disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Delete {projectLabel.singular.toLowerCase()}
      </button>
      <ConfirmDialog
        open={open}
        title={`Delete ${projectLabel.singular.toLowerCase()}?`}
        message={`This will permanently delete the ${projectLabel.singular.toLowerCase()} and cannot be undone.`}
        confirmLabel="Delete"
```

- [ ] **Step 3: Modify `src/components/projects/SwmsDocumentPdf.tsx`**

Find:
```typescript
type Props = {
  projectName: string
  docType: 'swms' | 'jsa'
```
Replace with:
```typescript
type Props = {
  projectName: string
  projectLabel: string
  docType: 'swms' | 'jsa'
```

Find:
```typescript
export default function SwmsDocumentPdf({
  projectName, docType, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  whoAtRisk, equipment, emergencyProcedures, signatures,
}: Props) {
```
Replace with:
```typescript
export default function SwmsDocumentPdf({
  projectName, projectLabel, docType, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  whoAtRisk, equipment, emergencyProcedures, signatures,
}: Props) {
```

Find:
```tsx
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Project</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
```
Replace with:
```tsx
          <View style={styles.metaBlock}>
            <Text style={styles.label}>{projectLabel}</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
```

- [ ] **Step 4: Modify `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`**

Find:
```typescript
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'
```
Replace with:
```typescript
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'
```

Find:
```typescript
  const { data: projectRow } = await supabase.from('projects').select('name').eq('id', projectId).single()
```
Replace with:
```typescript
  const { data: projectRow } = await supabase.from('projects').select('name').eq('id', projectId).single()
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```typescript
  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    docType: content.docType,
```
Replace with:
```typescript
  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    projectLabel: terminology.project.singular,
    docType: content.docType,
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" src/components/projects/DeleteProjectButton.tsx src/components/projects/SwmsDocumentPdf.tsx "src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts"
git commit -m "handover: JT-4 project-to-job wording on detail page, delete button, SWMS/JSA PDF"
```

---

### Task JT-5: Time tracking

**Files:**
- Modify: `src/app/dashboard/time/page.tsx`
- Modify: `src/components/time/TimeSection.tsx`
- Modify: `src/components/time/TimerWidget.tsx`
- Modify: `src/components/time/AdditionalHoursPanel.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `TimeSection`, `TimerWidget`, `AdditionalHoursPanel` each gain a
  `projectLabel: { singular: string; plural: string }` prop.

- [ ] **Step 1: Modify `src/app/dashboard/time/page.tsx`**

Find:
```typescript
import TimeSection from '@/components/time/TimeSection'
```
Replace with:
```typescript
import TimeSection from '@/components/time/TimeSection'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```tsx
        <TimeSection activeEntry={activeEntry} initialEntries={todayEntries ?? []} userId={user.id} rosterManaged={rosterManaged} />
```
Replace with:
```tsx
        <TimeSection activeEntry={activeEntry} initialEntries={todayEntries ?? []} userId={user.id} rosterManaged={rosterManaged} projectLabel={(await getWorkspaceProfileForUser(supabase, user.id)).terminology.project} />
```

- [ ] **Step 2: Modify `src/components/time/TimeSection.tsx`**

Find:
```typescript
export default function TimeSection({
  userId,
  initialEntries,
  activeEntry,
  rosterManaged = false,
}: {
  userId: string
  initialEntries: TimeEntry[]
  activeEntry: ActiveEntry | null
  rosterManaged?: boolean
}) {
  const [entries, setEntries] = useState(initialEntries)

  function handleAdd(entry: TimeEntry) {
    setEntries(prev => [entry, ...prev])
  }

  if (rosterManaged) {
    return <AdditionalHoursPanel />
  }

  return (
    <>
      <TimerWidget activeEntry={activeEntry} onEntryCompleted={handleAdd} />
```
Replace with:
```typescript
export default function TimeSection({
  userId,
  initialEntries,
  activeEntry,
  rosterManaged = false,
  projectLabel,
}: {
  userId: string
  initialEntries: TimeEntry[]
  activeEntry: ActiveEntry | null
  rosterManaged?: boolean
  projectLabel: { singular: string; plural: string }
}) {
  const [entries, setEntries] = useState(initialEntries)

  function handleAdd(entry: TimeEntry) {
    setEntries(prev => [entry, ...prev])
  }

  if (rosterManaged) {
    return <AdditionalHoursPanel projectLabel={projectLabel} />
  }

  return (
    <>
      <TimerWidget activeEntry={activeEntry} onEntryCompleted={handleAdd} projectLabel={projectLabel} />
```

- [ ] **Step 3: Modify `src/components/time/TimerWidget.tsx`**

Find:
```typescript
export default function TimerWidget({ activeEntry, onEntryCompleted }: { activeEntry: Entry | null; onEntryCompleted?: (entry: CompletedEntry) => void }) {
```
Replace with:
```typescript
export default function TimerWidget({ activeEntry, onEntryCompleted, projectLabel }: { activeEntry: Entry | null; onEntryCompleted?: (entry: CompletedEntry) => void; projectLabel: { singular: string; plural: string } }) {
```

Find:
```tsx
              <label className="mb-1 block text-xs font-semibold text-gray-500">Link to project (optional)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No project —</option>
```
Replace with:
```tsx
              <label className="mb-1 block text-xs font-semibold text-gray-500">Link to {projectLabel.singular.toLowerCase()} (optional)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No {projectLabel.singular.toLowerCase()} —</option>
```

- [ ] **Step 4: Modify `src/components/time/AdditionalHoursPanel.tsx`**

Find:
```typescript
export default function AdditionalHoursPanel() {
```
Replace with:
```typescript
export default function AdditionalHoursPanel({ projectLabel }: { projectLabel: { singular: string; plural: string } }) {
```

Find:
```tsx
              Project (optional)
```
Replace with:
```tsx
              {projectLabel.singular} (optional)
```

Find:
```tsx
              <option value="">— Select project —</option>
```
Replace with:
```tsx
              <option value="">— Select {projectLabel.singular.toLowerCase()} —</option>
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/time/page.tsx src/components/time/TimeSection.tsx src/components/time/TimerWidget.tsx src/components/time/AdditionalHoursPanel.tsx
git commit -m "handover: JT-5 project-to-job wording on time tracking"
```

---

### Task JT-6: Calendar

**Files:**
- Modify: `src/app/dashboard/calendar/page.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/components/calendar/DayPanel.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `CalendarView` and `DayPanel` each gain a
  `projectLabel: { singular: string; plural: string }` prop. `TYPE_LABELS` in both files moves
  from a module-level constant to a value computed inside the component (it needs to read the new
  prop).

- [ ] **Step 1: Modify `src/app/dashboard/calendar/page.tsx`**

Find:
```typescript
import CalendarView from '@/components/calendar/CalendarView'
import NudgeBanner from '@/components/NudgeBanner'
import { getAustralianPublicHolidays, type AustralianState } from '@/lib/australian-public-holidays'
```
Replace with:
```typescript
import CalendarView from '@/components/calendar/CalendarView'
import NudgeBanner from '@/components/NudgeBanner'
import { getAustralianPublicHolidays, type AustralianState } from '@/lib/australian-public-holidays'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const holidays = profile?.au_state
```
Replace with:
```typescript
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const holidays = profile?.au_state
```

Find:
```tsx
        <CalendarView
          userId={user.id}
          orgId={membership?.org_id ?? null}
          initialEvents={events ?? []}
          projects={projects ?? []}
          tasks={tasks ?? []}
          leaveRequests={[...(leave ?? []), ...holidays]}
          sessions={sessions ?? []}
        />
```
Replace with:
```tsx
        <CalendarView
          userId={user.id}
          orgId={membership?.org_id ?? null}
          initialEvents={events ?? []}
          projects={projects ?? []}
          tasks={tasks ?? []}
          leaveRequests={[...(leave ?? []), ...holidays]}
          sessions={sessions ?? []}
          projectLabel={terminology.project}
        />
```

- [ ] **Step 2: Modify `src/components/calendar/CalendarView.tsx`**

Find:
```typescript
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COLOURS: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', normal: '#2563eb', low: '#6b7280' }

const TYPE_LABELS: Record<CalendarItem['type'], string> = {
  event: 'Event', project: 'Project', task: 'Task', leave: 'Leave', session: 'Session',
}

function toDateStr(d: Date) {
```
Replace with:
```typescript
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COLOURS: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', normal: '#2563eb', low: '#6b7280' }

function toDateStr(d: Date) {
```

Find:
```typescript
export default function CalendarView({ userId, orgId, initialEvents, projects, tasks, leaveRequests = [], sessions = [] }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
  leaveRequests?: LeaveRequest[]
  sessions?: Session[]
}) {
  const [events, setEvents] = useState(initialEvents)
```
Replace with:
```typescript
export default function CalendarView({ userId, orgId, initialEvents, projects, tasks, leaveRequests = [], sessions = [], projectLabel }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
  leaveRequests?: LeaveRequest[]
  sessions?: Session[]
  projectLabel: { singular: string; plural: string }
}) {
  const TYPE_LABELS: Record<CalendarItem['type'], string> = {
    event: 'Event', project: projectLabel.singular, task: 'Task', leave: 'Leave', session: 'Session',
  }
  const [events, setEvents] = useState(initialEvents)
```

Find:
```tsx
      {/* Day detail panel — shared */}
      {selected && (
        <DayPanel
          date={selected}
          items={byDate[selected] ?? []}
          onAddEvent={() => openNewEvent(selected)}
          onClose={() => setSelected(null)}
        />
      )}
```
Replace with:
```tsx
      {/* Day detail panel — shared */}
      {selected && (
        <DayPanel
          date={selected}
          items={byDate[selected] ?? []}
          onAddEvent={() => openNewEvent(selected)}
          onClose={() => setSelected(null)}
          projectLabel={projectLabel}
        />
      )}
```

- [ ] **Step 3: Modify `src/components/calendar/DayPanel.tsx`**

Find:
```typescript
import Link from 'next/link'
import type { CalendarItem } from './CalendarView'

const TYPE_LABELS: Record<string, string> = { event: 'Event', project: 'Project deadline', task: 'Task due', leave: 'Approved leave', session: 'Session' }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export default function DayPanel({ date, items, onAddEvent, onClose }: {
  date: string
  items: CalendarItem[]
  onAddEvent: () => void
  onClose: () => void
}) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' })
```
Replace with:
```typescript
import Link from 'next/link'
import type { CalendarItem } from './CalendarView'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export default function DayPanel({ date, items, onAddEvent, onClose, projectLabel }: {
  date: string
  items: CalendarItem[]
  onAddEvent: () => void
  onClose: () => void
  projectLabel: { singular: string; plural: string }
}) {
  const TYPE_LABELS: Record<string, string> = { event: 'Event', project: `${projectLabel.singular} deadline`, task: 'Task due', leave: 'Approved leave', session: 'Session' }
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' })
```

- [ ] **Step 4: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/calendar/page.tsx src/components/calendar/CalendarView.tsx src/components/calendar/DayPanel.tsx
git commit -m "handover: JT-6 project-to-job wording on the calendar"
```

---

### Task JT-7: Invoices/Quotes picker + AI assistant chip

**Files:**
- Modify: `src/app/dashboard/invoices/new/page.tsx`
- Modify: `src/app/dashboard/quotes/new/page.tsx`
- Modify: `src/components/invoices/NewInvoiceForm.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/FloatingWidgets.tsx`
- Modify: `src/components/AssistantWidget.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1. `dashboard/layout.tsx` was already modified in JT-2
  (it now has `projectLabel={terminology.project}` on its `<DashboardShell>` call) — this task
  edits a *different* JSX line in the same return block (`<FloatingWidgets>`), so it must run
  after JT-2 is merged.
- Produces: `NewInvoiceForm`, `FloatingWidgets`, `AssistantWidget` each gain a `projectLabel`
  prop.

- [ ] **Step 1: Modify `src/components/invoices/NewInvoiceForm.tsx`**

Find:
```typescript
export default function NewInvoiceForm({
  orgId,
  userId,
  initialClientId,
  isQuote = false,
  clientLabel,
}: {
  orgId: string | null
  userId: string
  initialClientId?: string
  isQuote?: boolean
  clientLabel: { singular: string; plural: string }
}) {
```
Replace with:
```typescript
export default function NewInvoiceForm({
  orgId,
  userId,
  initialClientId,
  isQuote = false,
  clientLabel,
  projectLabel,
}: {
  orgId: string | null
  userId: string
  initialClientId?: string
  isQuote?: boolean
  clientLabel: { singular: string; plural: string }
  projectLabel: { singular: string; plural: string }
}) {
```

Find:
```tsx
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project (optional)</label>
```
Replace with:
```tsx
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{projectLabel.singular} (optional)</label>
```

- [ ] **Step 2: Modify `src/app/dashboard/invoices/new/page.tsx`**

Find:
```typescript
        <NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} clientLabel={terminology.client} />
```
Replace with:
```typescript
        <NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} clientLabel={terminology.client} projectLabel={terminology.project} />
```

- [ ] **Step 3: Modify `src/app/dashboard/quotes/new/page.tsx`**

Find:
```tsx
        <NewInvoiceForm
          orgId={membership?.org_id ?? null}
          userId={user.id}
          initialClientId={clientId}
          isQuote={true}
          clientLabel={terminology.client}
        />
```
Replace with:
```tsx
        <NewInvoiceForm
          orgId={membership?.org_id ?? null}
          userId={user.id}
          initialClientId={clientId}
          isQuote={true}
          clientLabel={terminology.client}
          projectLabel={terminology.project}
        />
```

(This page already calls `getWorkspaceProfileForUser` and destructures `terminology` — no new
fetch needed.)

- [ ] **Step 4: Modify `src/app/dashboard/layout.tsx`**

Find:
```tsx
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} projectLabel={terminology.project} navOverrides={navOverrides}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} />
```
Replace with:
```tsx
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} projectLabel={terminology.project} navOverrides={navOverrides}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} projectLabel={terminology.project} />
```

(This Find block assumes JT-2 has already been merged — it matches the post-JT-2 file content,
not the original pre-JT-2 content.)

- [ ] **Step 5: Modify `src/components/FloatingWidgets.tsx`**

Find:
```typescript
export default function FloatingWidgets({ userEmail }: { userEmail: string }) {
```
Replace with:
```typescript
export default function FloatingWidgets({ userEmail, projectLabel }: { userEmail: string; projectLabel: { singular: string; plural: string } }) {
```

Find:
```tsx
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
            />
          </div>
        ) : (
          <div style={{ position: 'fixed', left: assistantPos!.x, top: assistantPos!.y, zIndex: 50 }}>
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
              onHeaderPointerDown={handleAssistantHeaderPointerDown}
            />
```
Replace with:
```tsx
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
              projectLabel={projectLabel}
            />
          </div>
        ) : (
          <div style={{ position: 'fixed', left: assistantPos!.x, top: assistantPos!.y, zIndex: 50 }}>
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
              onHeaderPointerDown={handleAssistantHeaderPointerDown}
              projectLabel={projectLabel}
            />
```

- [ ] **Step 6: Modify `src/components/AssistantWidget.tsx`**

Find:
```typescript
export default function AssistantWidget({
  userEmail,
  open,
  onClose,
  onHeaderPointerDown,
}: {
  userEmail: string
  open: boolean
  onClose: () => void
  onHeaderPointerDown?: (e: React.PointerEvent) => void
}) {
```
Replace with:
```typescript
export default function AssistantWidget({
  userEmail,
  open,
  onClose,
  onHeaderPointerDown,
  projectLabel,
}: {
  userEmail: string
  open: boolean
  onClose: () => void
  onHeaderPointerDown?: (e: React.PointerEvent) => void
  projectLabel: { singular: string; plural: string }
}) {
```

Find:
```typescript
  const CHIPS = [
    'Summarise this week',
    'Check outstanding invoices',
    'What tasks are overdue?',
    'Log time for today',
    'Show active projects',
  ]
```
Replace with:
```typescript
  const CHIPS = [
    'Summarise this week',
    'Check outstanding invoices',
    'What tasks are overdue?',
    'Log time for today',
    `Show active ${projectLabel.plural.toLowerCase()}`,
  ]
```

- [ ] **Step 7: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 8: Commit**

```bash
git add "src/app/dashboard/invoices/new/page.tsx" "src/app/dashboard/quotes/new/page.tsx" src/components/invoices/NewInvoiceForm.tsx src/app/dashboard/layout.tsx src/components/FloatingWidgets.tsx src/components/AssistantWidget.tsx
git commit -m "handover: JT-7 project-to-job wording on invoices/quotes and the assistant chip"
```

---

### Task JT-8: Video scheduling

**Files:**
- Modify: `src/app/dashboard/video/page.tsx`
- Modify: `src/components/video/VideoPageClient.tsx`
- Modify: `src/components/video/ScheduleCallDialog.tsx`
- Modify: `src/components/video/VideoCalendar.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1.
- Produces: `VideoPageClient`, `ScheduleCallDialog`, `VideoCalendar` each gain a
  `projectLabel: { singular: string; plural: string }` prop.

- [ ] **Step 1: Modify `src/app/dashboard/video/page.tsx`**

Find:
```typescript
import VideoCalendar from '@/components/video/VideoCalendar'
import VideoPageClient from '@/components/video/VideoPageClient'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
```
Replace with:
```typescript
import VideoCalendar from '@/components/video/VideoCalendar'
import VideoPageClient from '@/components/video/VideoPageClient'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const orgId = membership.org_id
  const canSchedule = ['owner', 'admin', 'manager'].includes(membership.role)
```
Replace with:
```typescript
  const orgId = membership.org_id
  const canSchedule = ['owner', 'admin', 'manager'].includes(membership.role)
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
        <VideoPageClient
          orgId={orgId}
          members={members}
          canSchedule={canSchedule}
          projects={(projects ?? []) as { id: string; name: string; colour: string }[]}
        />
      </div>
      <VideoCalendar
        calls={(calls ?? []) as ScheduledCall[]}
        canManage={canSchedule}
        projects={(projects ?? []) as { id: string; name: string; colour: string }[]}
      />
```
Replace with:
```tsx
        <VideoPageClient
          orgId={orgId}
          members={members}
          canSchedule={canSchedule}
          projects={(projects ?? []) as { id: string; name: string; colour: string }[]}
          projectLabel={terminology.project}
        />
      </div>
      <VideoCalendar
        calls={(calls ?? []) as ScheduledCall[]}
        canManage={canSchedule}
        projects={(projects ?? []) as { id: string; name: string; colour: string }[]}
        projectLabel={terminology.project}
      />
```

- [ ] **Step 2: Modify `src/components/video/VideoPageClient.tsx`**

Find:
```typescript
type Props = {
  orgId: string
  members: OrgMember[]
  canSchedule: boolean
  projects?: Project[]
}

export default function VideoPageClient({ orgId, members, canSchedule, projects = [] }: Props) {
```
Replace with:
```typescript
type Props = {
  orgId: string
  members: OrgMember[]
  canSchedule: boolean
  projects?: Project[]
  projectLabel: { singular: string; plural: string }
}

export default function VideoPageClient({ orgId, members, canSchedule, projects = [], projectLabel }: Props) {
```

Find:
```tsx
      {showSchedule && (
        <ScheduleCallDialog
          orgId={orgId}
          members={members}
          projects={projects}
          onClose={() => setShowSchedule(false)}
        />
      )}
```
Replace with:
```tsx
      {showSchedule && (
        <ScheduleCallDialog
          orgId={orgId}
          members={members}
          projects={projects}
          projectLabel={projectLabel}
          onClose={() => setShowSchedule(false)}
        />
      )}
```

- [ ] **Step 3: Modify `src/components/video/ScheduleCallDialog.tsx`**

Find:
```typescript
type Props = {
  orgId: string
  members: OrgMember[]
  onClose: () => void
  projects?: { id: string; name: string; colour: string }[]
}

type ExternalGuest = { email: string; displayName: string }

export default function ScheduleCallDialog({ orgId, members, onClose, projects = [] }: Props) {
```
Replace with:
```typescript
type Props = {
  orgId: string
  members: OrgMember[]
  onClose: () => void
  projects?: { id: string; name: string; colour: string }[]
  projectLabel: { singular: string; plural: string }
}

type ExternalGuest = { email: string; displayName: string }

export default function ScheduleCallDialog({ orgId, members, onClose, projects = [], projectLabel }: Props) {
```

Find:
```tsx
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Project</p>
```
Replace with:
```tsx
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{projectLabel.singular}</p>
```

- [ ] **Step 4: Modify `src/components/video/VideoCalendar.tsx`**

Find:
```typescript
type Props = {
  calls: ScheduledCall[]
  canManage?: boolean
  projects?: { id: string; name: string; colour: string }[]
}
```
Replace with:
```typescript
type Props = {
  calls: ScheduledCall[]
  canManage?: boolean
  projects?: { id: string; name: string; colour: string }[]
  projectLabel: { singular: string; plural: string }
}
```

Find:
```typescript
export default function VideoCalendar({ calls: initialCalls, canManage = false, projects = [] }: Props) {
```
Replace with:
```typescript
export default function VideoCalendar({ calls: initialCalls, canManage = false, projects = [], projectLabel }: Props) {
```

Find:
```tsx
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Project</p>
```
Replace with:
```tsx
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{projectLabel.singular}</p>
```

Find:
```tsx
                  <option value="">No project</option>
```
Replace with:
```tsx
                  <option value="">No {projectLabel.singular.toLowerCase()}</option>
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/video/page.tsx src/components/video/VideoPageClient.tsx src/components/video/ScheduleCallDialog.tsx src/components/video/VideoCalendar.tsx
git commit -m "handover: JT-8 project-to-job wording on video scheduling"
```

---

### Task JT-9: Dashboard tile & Insights

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/dashboard/DashboardMetrics.tsx`
- Modify: `src/app/dashboard/insights/OverviewPanel.tsx`
- Modify: `src/components/insights/ProjectHealthTable.tsx`
- Modify: `src/components/insights/ProjectBreakdown.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1. `dashboard/page.tsx` already calls
  `getWorkspaceProfileForUser` (stored as `workspaceProfile`, used for `supportsMultiSite`) — this
  task reads `workspaceProfile.terminology.project` from that same existing call, no new fetch.
  `OverviewPanel` is a standalone async server component taking no props — it fetches its own
  workspace profile directly.
- Produces: `DashboardMetrics`, `ProjectHealthTable`, `ProjectBreakdown` each gain a
  `projectLabel: { singular: string; plural: string }` prop.

- [ ] **Step 1: Modify `src/app/dashboard/page.tsx`**

Find:
```tsx
        <DashboardMetrics
          sessionsCompleted={sessionsThisWeekCompleted}
          sessionsTotal={sessionsThisWeekTotal}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
          overdueTotal={overdueTotal}
          overdueCurrency={overdueCurrency}
        />
```
Replace with:
```tsx
        <DashboardMetrics
          sessionsCompleted={sessionsThisWeekCompleted}
          sessionsTotal={sessionsThisWeekTotal}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
          overdueTotal={overdueTotal}
          overdueCurrency={overdueCurrency}
          projectLabel={workspaceProfile.terminology.project}
        />
```

- [ ] **Step 2: Modify `src/components/dashboard/DashboardMetrics.tsx`**

Find:
```typescript
type Props = {
  sessionsCompleted: number
  sessionsTotal: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
  overdueTotal: number
  overdueCurrency: string
}
```
Replace with:
```typescript
type Props = {
  sessionsCompleted: number
  sessionsTotal: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
  overdueTotal: number
  overdueCurrency: string
  projectLabel: { singular: string; plural: string }
}
```

Find:
```typescript
export default function DashboardMetrics({ sessionsCompleted, sessionsTotal, activeProjects, tasksCompleted, tasksTotal, activeClients, overdueTotal, overdueCurrency }: Props) {
```
Replace with:
```typescript
export default function DashboardMetrics({ sessionsCompleted, sessionsTotal, activeProjects, tasksCompleted, tasksTotal, activeClients, overdueTotal, overdueCurrency, projectLabel }: Props) {
```

Find:
```tsx
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label="Active projects"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/projects"
      />
```
Replace with:
```tsx
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label={`Active ${projectLabel.plural.toLowerCase()}`}
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/projects"
      />
```

- [ ] **Step 3: Modify `src/app/dashboard/insights/OverviewPanel.tsx`**

Find:
```typescript
import OrgStatsPanel, { type MemberStat } from '@/components/insights/OrgStatsPanel'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
```
Replace with:
```typescript
import OrgStatsPanel, { type MemberStat } from '@/components/insights/OrgStatsPanel'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```
Replace with:
```typescript
  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
      <ProjectBreakdown projects={projectBars} totalHours={totalProjectHours} />
      <ProjectHealthTable projects={projectHealth} />
```
Replace with:
```tsx
      <ProjectBreakdown projects={projectBars} totalHours={totalProjectHours} projectLabel={terminology.project} />
      <ProjectHealthTable projects={projectHealth} projectLabel={terminology.project} />
```

- [ ] **Step 4: Modify `src/components/insights/ProjectHealthTable.tsx`**

Find:
```typescript
export default function ProjectHealthTable({ projects }: { projects: ProjectHealth[] }) {
  if (projects.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Project health</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Project</th>
```
Replace with:
```typescript
export default function ProjectHealthTable({ projects, projectLabel }: { projects: ProjectHealth[]; projectLabel: { singular: string; plural: string } }) {
  if (projects.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{projectLabel.singular} health</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">{projectLabel.singular}</th>
```

- [ ] **Step 5: Modify `src/components/insights/ProjectBreakdown.tsx`**

Find:
```typescript
export default function ProjectBreakdown({ projects, totalHours }: {
  projects: ProjectBar[]
  totalHours: number
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Time by project</h3>
        <p className="text-sm font-semibold text-gray-400">
          No project-linked entries yet. Link tasks to time entries to see this breakdown.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Time by project</h3>
```
Replace with:
```typescript
export default function ProjectBreakdown({ projects, totalHours, projectLabel }: {
  projects: ProjectBar[]
  totalHours: number
  projectLabel: { singular: string; plural: string }
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Time by {projectLabel.singular.toLowerCase()}</h3>
        <p className="text-sm font-semibold text-gray-400">
          No {projectLabel.singular.toLowerCase()}-linked entries yet. Link tasks to time entries to see this breakdown.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Time by {projectLabel.singular.toLowerCase()}</h3>
```

- [ ] **Step 6: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx src/components/dashboard/DashboardMetrics.tsx src/app/dashboard/insights/OverviewPanel.tsx src/components/insights/ProjectHealthTable.tsx src/components/insights/ProjectBreakdown.tsx
git commit -m "handover: JT-9 project-to-job wording on the dashboard tile and insights"
```

---

### Task JT-10: Reports export, client detail tile, billing page

**Files:**
- Modify: `src/app/dashboard/reports/ExportPanel.tsx`
- Modify: `src/components/reports/ReportsClient.tsx`
- Modify: `src/app/dashboard/clients/[id]/page.tsx`
- Modify: `src/app/dashboard/billing/page.tsx`

**Interfaces:**
- Consumes: `terminology.project` from JT-1. `clients/[id]/page.tsx` already calls
  `getWorkspaceProfileForUser` (destructured as `terminology, key: profileKey, supportsMultiSite`)
  — no new fetch needed there.
- Produces: `ReportsClient` gains a `projectLabel: { singular: string; plural: string }` prop.

- [ ] **Step 1: Modify `src/app/dashboard/reports/ExportPanel.tsx`**

Find:
```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ReportsClient from '@/components/reports/ReportsClient'
import { canExportReports, getSubscription, isTeamPlan } from '@/lib/subscription'
```
Replace with:
```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ReportsClient from '@/components/reports/ReportsClient'
import { canExportReports, getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const subscription = await getSubscription(user.id)
```
Replace with:
```typescript
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const subscription = await getSubscription(user.id)
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
      <ReportsClient
        userId={user.id}
        orgId={membership?.org_id ?? null}
        isManager={isManager && isTeamPlan(subscription)}
      />
```
Replace with:
```tsx
      <ReportsClient
        userId={user.id}
        orgId={membership?.org_id ?? null}
        isManager={isManager && isTeamPlan(subscription)}
        projectLabel={terminology.project}
      />
```

- [ ] **Step 2: Modify `src/components/reports/ReportsClient.tsx`**

Find:
```typescript
export default function ReportsClient({ userId, orgId, isManager }: {
  userId: string
  orgId: string | null
  isManager: boolean
}) {
```
Replace with:
```typescript
export default function ReportsClient({ userId, orgId, isManager, projectLabel }: {
  userId: string
  orgId: string | null
  isManager: boolean
  projectLabel: { singular: string; plural: string }
}) {
```

Find:
```typescript
      ['Date', 'Day', 'Start', 'End', 'Hours (decimal)', 'Hours (hm)', 'Award Flags', 'Task', 'Project', 'Description'],
```
Replace with:
```typescript
      ['Date', 'Day', 'Start', 'End', 'Hours (decimal)', 'Hours (hm)', 'Award Flags', 'Task', projectLabel.singular, 'Description'],
```

Find:
```tsx
            description="All time entries for the selected period — includes decimal hours, task, project, and payroll flags for overtime, weekends, and public holidays.">
```
Replace with:
```tsx
            description={`All time entries for the selected period — includes decimal hours, task, ${projectLabel.singular.toLowerCase()}, and payroll flags for overtime, weekends, and public holidays.`}>
```

- [ ] **Step 3: Modify `src/app/dashboard/clients/[id]/page.tsx`**

Find:
```tsx
            <Tile title="Projects" icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
```
Replace with:
```tsx
            <Tile title={terminology.project.plural} icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
```

- [ ] **Step 4: Modify `src/app/dashboard/billing/page.tsx`**

Find:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isActive } from '@/lib/subscription'
import { PLANS } from '@/lib/stripe'
import { UpgradeButton, ManageButton } from '@/components/billing/BillingClient'
```
Replace with:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isActive } from '@/lib/subscription'
import { PLANS } from '@/lib/stripe'
import { UpgradeButton, ManageButton } from '@/components/billing/BillingClient'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const sub = await getSubscription(user.id)
  const { success } = await searchParams
  const active = isActive(sub)
```
Replace with:
```typescript
  const sub = await getSubscription(user.id)
  const { success } = await searchParams
  const active = isActive(sub)
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
              <ul className="mb-6 space-y-2 text-sm font-semibold text-gray-600">
                <li>✓ Unlimited projects</li>
                <li>✓ Full time history</li>
                <li>✓ All features</li>
                <li>✓ Export reports</li>
              </ul>
              <UpgradeButton plan="pro" label="Upgrade to Pro" />
```
Replace with:
```tsx
              <ul className="mb-6 space-y-2 text-sm font-semibold text-gray-600">
                <li>✓ Unlimited {terminology.project.plural.toLowerCase()}</li>
                <li>✓ Full time history</li>
                <li>✓ All features</li>
                <li>✓ Export reports</li>
              </ul>
              <UpgradeButton plan="pro" label="Upgrade to Pro" />
```

Find:
```tsx
              <li>· Up to {PLANS.free.projects} active projects</li>
```
Replace with:
```tsx
              <li>· Up to {PLANS.free.projects} active {terminology.project.plural.toLowerCase()}</li>
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/reports/ExportPanel.tsx src/components/reports/ReportsClient.tsx "src/app/dashboard/clients/[id]/page.tsx"
git commit -m "handover: JT-10 project-to-job wording on reports export and client detail tile"
```

- [ ] **Step 7: Final sweep (conductor-only, no code change expected)**

```bash
grep -rin "project" src/app/dashboard/projects src/app/dashboard/clients src/components/projects src/components/dashboard src/components/insights src/components/calendar src/components/video src/components/time src/components/reports src/components/invoices src/components/AssistantWidget.tsx src/components/FloatingWidgets.tsx src/components/DashboardShell.tsx
```
Expected: every remaining hit is either a variable/type/column name (`project_id`,
`activeProjectIds`, `type Project = {...}`), a URL (`/dashboard/projects`), or the deliberate
`billing/page.tsx` no-op from Step 4 above — no remaining literal user-facing "Project" text in
the in-scope areas.

---

## Acceptance checklist

- [ ] JT-1 through JT-10: every in-scope area (registry, page title, projects list/creation,
  project detail + PDF, time tracking, calendar, invoices/quotes + assistant chip, video
  scheduling, dashboard/insights, reports/client-tile) reads from `terminology.project` instead of
  a hardcoded "Project" string.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Final `grep` sweep (JT-10 Step 7) turns up nothing but variable names, URLs, and the
  documented `billing/page.tsx` no-op.
- [ ] Manual smoke (deferred to the user): log in as a Builder & Construction (or Trades) org and
  click through Projects list → detail → creation → SWMS panel → Dashboard tile → Insights →
  Calendar → Time → Video scheduling → Invoices/Quotes → the AI assistant's suggestion chips,
  confirming every one says "Job"/"Jobs". Check a Real Estate org shows "Listing"/"Listings" in
  the same places. Check an unaffected profile (Consulting, or Tutoring which now shows "Learning
  Plan") to confirm nothing bled over.
