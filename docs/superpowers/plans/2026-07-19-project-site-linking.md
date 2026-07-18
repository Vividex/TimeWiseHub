# Project ↔ Site Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `projects.site_id` (added in the Site Sign-In migration, currently unused by any
UI) a real way to get set — at creation time and retroactively on existing projects — client-scoped,
optional, gated to multi-site workspace profiles.

**Architecture:** No new tables or columns — `projects.site_id` already exists (schema-111). Two
UI surfaces: a client-scoped site dropdown added to the existing project creation form, and a new
small standalone control on the project detail page (there's no general project-edit form today,
so this is deliberately narrow rather than building one) for retrofitting existing projects.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`).

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- No database migration this phase — `projects.site_id` already exists.
- No new npm dependencies.
- Both surfaces gated to `supportsMultiSite` workspace profiles only (`builder_construction`,
  `trades_field_services`, `real_estate`, `cleaning_maintenance`) — matches how `client_sites`
  itself is already gated.
- A site is always scoped to the project's own client — never let a project reference a site
  belonging to a different client.
- Source spec: `docs/superpowers/specs/2026-07-19-project-site-linking-design.md`.

---

### Task 1: Site picker at project creation

**Files:**
- Modify: `src/components/projects/ProjectForm.tsx`
- Modify: `src/app/dashboard/projects/page.tsx`
- Modify: `src/app/api/projects/route.ts`

**Interfaces:**
- Consumes: `client_sites` (existing table, from schema-104).
- Produces: `ProjectForm` gains a `supportsMultiSite: boolean` prop; its POST payload gains
  `site_id`; `POST /api/projects` accepts and stores it.

- [ ] **Step 1: Modify `src/components/projects/ProjectForm.tsx`**

Find:
```typescript
type Client = { id: string; name: string; default_rate: number | null; currency: string }

export default function ProjectForm({
  userId,
  orgId,
  activeProjectCount,
  activeProjectLimit,
}: {
  userId: string
  orgId: string | null
  activeProjectCount: number
  activeProjectLimit: number | null
}) {
```
Replace with:
```typescript
type Client = { id: string; name: string; default_rate: number | null; currency: string }
type Site = { id: string; label: string }

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

Find:
```typescript
  const [clientId, setClientId] = useState('')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetDollars, setBudgetDollars] = useState('')
  const [clients, setClients] = useState<Client[]>([])
```
Replace with:
```typescript
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetDollars, setBudgetDollars] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [sites, setSites] = useState<Site[]>([])
```

Find:
```typescript
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    const q = orgId
      ? supabase.from('clients').select('id, name, default_rate, currency').or(`owner_id.eq.${userId},org_id.eq.${orgId}`).eq('archived', false).order('name')
      : supabase.from('clients').select('id, name, default_rate, currency').eq('owner_id', userId).eq('archived', false).order('name')
    q.then(({ data }) => setClients(data ?? []))
  }, [open, orgId, userId])
```
Replace with:
```typescript
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    const q = orgId
      ? supabase.from('clients').select('id, name, default_rate, currency').or(`owner_id.eq.${userId},org_id.eq.${orgId}`).eq('archived', false).order('name')
      : supabase.from('clients').select('id, name, default_rate, currency').eq('owner_id', userId).eq('archived', false).order('name')
    q.then(({ data }) => setClients(data ?? []))
  }, [open, orgId, userId])

  useEffect(() => {
    setSiteId('')
    if (!open || !clientId || !supportsMultiSite) { setSites([]); return }
    const supabase = createClient()
    supabase.from('client_sites').select('id, label').eq('client_id', clientId).eq('is_archived', false).order('label')
      .then(({ data }) => setSites(data ?? []))
  }, [open, clientId, supportsMultiSite])
```

Find:
```typescript
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId && scope === 'org' ? orgId : null,
      name,
      description: description || null,
      colour,
      due_date: dueDate || null,
      client_id: clientId || null,
      budget_hours: budgetHours ? Number(budgetHours) : null,
      budget_dollars: budgetDollars ? Number(budgetDollars) : null,
      }),
    })
```
Replace with:
```typescript
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId && scope === 'org' ? orgId : null,
      name,
      description: description || null,
      colour,
      due_date: dueDate || null,
      client_id: clientId || null,
      site_id: siteId || null,
      budget_hours: budgetHours ? Number(budgetHours) : null,
      budget_dollars: budgetDollars ? Number(budgetDollars) : null,
      }),
    })
```

Find:
```typescript
    setName(''); setDescription(''); setDueDate('')
    setClientId(''); setBudgetHours(''); setBudgetDollars('')
```
Replace with:
```typescript
    setName(''); setDescription(''); setDueDate('')
    setClientId(''); setSiteId(''); setBudgetHours(''); setBudgetDollars('')
```

Find:
```tsx
          {clients.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Client (optional)</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.default_rate ? ` (${c.currency} ${Number(c.default_rate).toFixed(0)}/hr)` : ''}</option>)}
              </select>
            </div>
          )}
```
Replace with:
```tsx
          {clients.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Client (optional)</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.default_rate ? ` (${c.currency} ${Number(c.default_rate).toFixed(0)}/hr)` : ''}</option>)}
              </select>
            </div>
          )}

          {supportsMultiSite && sites.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Site (optional)</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No site —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
```

- [ ] **Step 2: Modify `src/app/dashboard/projects/page.tsx`**

Find:
```typescript
import { getSubscription, maxActiveProjects } from '@/lib/subscription'
```
Replace with:
```typescript
import { getSubscription, maxActiveProjects } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```

Find:
```typescript
  const subscription = await getSubscription(user.id)
  const limitRaw = maxActiveProjects(subscription)
  const limit = isFinite(limitRaw) ? limitRaw : null
```
Replace with:
```typescript
  const subscription = await getSubscription(user.id)
  const limitRaw = maxActiveProjects(subscription)
  const limit = isFinite(limitRaw) ? limitRaw : null
  const { supportsMultiSite } = await getWorkspaceProfileForUser(supabase, user.id)
```

Find:
```tsx
        <ProjectForm userId={user.id} orgId={orgId} activeProjectCount={activeCount} activeProjectLimit={limit} />
```
Replace with:
```tsx
        <ProjectForm userId={user.id} orgId={orgId} activeProjectCount={activeCount} activeProjectLimit={limit} supportsMultiSite={!!supportsMultiSite} />
```

(`supportsMultiSite` on `WorkspaceProfileConfig` is an optional flag, `boolean | undefined` —
`!!supportsMultiSite` matches the exact same pattern already used for `supportsSwms` elsewhere in
this codebase, e.g. `TeamGrid`'s `showLicenceClass` prop.)

- [ ] **Step 3: Modify `src/app/api/projects/route.ts`**

Find:
```typescript
type ProjectPayload = {
  org_id?: string | null
  name?: string
  description?: string | null
  colour?: string
  due_date?: string | null
  client_id?: string | null
  budget_hours?: number | null
  budget_dollars?: number | null
}
```
Replace with:
```typescript
type ProjectPayload = {
  org_id?: string | null
  name?: string
  description?: string | null
  colour?: string
  due_date?: string | null
  client_id?: string | null
  site_id?: string | null
  budget_hours?: number | null
  budget_dollars?: number | null
}
```

Find:
```typescript
  const { error } = await service.from('projects').insert({
    owner_id: user.id,
    org_id: orgId,
    name,
    description: payload.description || null,
    colour: payload.colour || '#2563eb',
    due_date: payload.due_date || null,
    client_id: payload.client_id || null,
    budget_hours: payload.budget_hours ?? null,
    budget_dollars: payload.budget_dollars ?? null,
  })
```
Replace with:
```typescript
  const { error } = await service.from('projects').insert({
    owner_id: user.id,
    org_id: orgId,
    name,
    description: payload.description || null,
    colour: payload.colour || '#2563eb',
    due_date: payload.due_date || null,
    client_id: payload.client_id || null,
    site_id: payload.site_id || null,
    budget_hours: payload.budget_hours ?? null,
    budget_dollars: payload.budget_dollars ?? null,
  })
```

No RLS change needed — `site_id` is just another nullable column on the same `projects` insert
already covered by the existing insert policy.

- [ ] **Step 4: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectForm.tsx src/app/dashboard/projects/page.tsx "src/app/api/projects/route.ts"
git commit -m "handover: PS-1 site picker at project creation"
```

---

### Task 2: Retrofit control for existing projects

**Files:**
- Create: `src/components/projects/ProjectSiteControl.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `client_sites` (existing table); `projects.client_id`/`site_id`.
- Produces: `ProjectSiteControl` — a standalone client component, same size/pattern as
  `ArchiveButton`/`DeleteProjectButton`.

- [ ] **Step 1: Create `src/components/projects/ProjectSiteControl.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Site = { id: string; label: string }

export default function ProjectSiteControl({
  projectId,
  clientId,
  currentSiteId,
  currentSiteLabel,
}: {
  projectId: string
  clientId: string | null
  currentSiteId: string | null
  currentSiteLabel: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState(currentSiteId ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing || !clientId) return
    const supabase = createClient()
    supabase.from('client_sites').select('id, label').eq('client_id', clientId).eq('is_archived', false).order('label')
      .then(({ data }) => setSites(data ?? []))
  }, [editing, clientId])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('projects').update({ site_id: selectedSiteId || null }).eq('id', projectId)
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  if (!clientId) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-gray-500 dark:text-slate-400">Site:</span>
      {editing ? (
        <>
          <select
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— No site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={handleSave} disabled={saving} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setSelectedSiteId(currentSiteId ?? '') }} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-gray-700 dark:text-slate-300">{currentSiteLabel ?? 'No site assigned'}</span>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
            {currentSiteLabel ? 'Change' : 'Assign site'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the project detail page**

Find:
```typescript
  const { supportsSwms } = await getWorkspaceProfileForUser(supabase, user.id)

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }, { data: expenses }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
```
Replace with:
```typescript
  const { supportsSwms, supportsMultiSite } = await getWorkspaceProfileForUser(supabase, user.id)

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }, { data: expenses }] = await Promise.all([
    supabase.from('projects').select('*, clients(name), client_sites(label)').eq('id', projectId).single(),
```

Find:
```typescript
import ProjectSwmsPanel from '@/components/projects/ProjectSwmsPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'
```
Replace with:
```typescript
import ProjectSwmsPanel from '@/components/projects/ProjectSwmsPanel'
import ProjectSiteControl from '@/components/projects/ProjectSiteControl'
import ArchiveButton from '@/components/projects/ArchiveButton'
```

Find:
```tsx
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">{project.name}</h1>
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
              </div>
```
Replace with:
```tsx
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">{project.name}</h1>
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
                {supportsMultiSite && canManageConfidential && (
                  <div className="mt-3">
                    <ProjectSiteControl
                      projectId={project.id}
                      clientId={project.client_id}
                      currentSiteId={project.site_id}
                      currentSiteLabel={(project.client_sites as unknown as { label: string } | null)?.label ?? null}
                    />
                  </div>
                )}
              </div>
```

(`project.client_sites` follows the same "Supabase infers foreign-key joins as arrays even when
single-valued" gotcha documented in `CLAUDE.md` — the `as unknown as { label: string } | null`
cast is required, a plain cast fails `tsc`.)

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean. This completes the phase.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectSiteControl.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx"
git commit -m "handover: PS-2 retrofit Site control on the project detail page"
```

- [ ] **Step 5: Manual smoke (deferred to the user)**

Create a project, pick a client, confirm the site dropdown populates from that client's sites and
the project saves with it set. Open an existing project with no site, use "Assign site," confirm
it persists after refresh and "Change" lets you swap it. Confirm the whole site UI (both
surfaces) is completely absent for a workspace profile without `supportsMultiSite`.

---

## Acceptance checklist

- [ ] Task 1: site picker at creation, client-scoped, optional, gated to multi-site profiles.
- [ ] Task 2: retrofit control on existing projects, same scoping and gating.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke per Task 2 Step 5 — user follow-up, not the conductor's to complete.
