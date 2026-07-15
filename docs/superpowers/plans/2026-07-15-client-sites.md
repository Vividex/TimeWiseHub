# Client Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client have more than one physical address (a "site"), so a session or incident report can reference a specific property instead of only the client's single billing address. Gated to the `trades_field_services`, `builder_construction`, `cleaning_maintenance`, `real_estate` workspace profiles.

**Architecture:** One new table (`client_sites`) hanging off `clients` via `client_id`, RLS-mirrored from the existing `students` table's pattern (owner-manage / org-view / org-admin-manage). Two nullable FK columns added to existing tables (`sessions.site_id`, `incident_reports.client_id` + `incident_reports.site_id`). All CRUD is direct `supabase.from(...)` calls in `'use client'` components (this repo has no lib-layer CRUD wrappers) plus one `/api/client-sites/[id]` route for admin-gated edit/archive/restore, mirroring `/api/students/[id]` exactly.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind v4.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- Migration file: `supabase/schema-104-client-sites.sql`, applied via Supabase MCP `apply_migration` (name: `client_sites`) — conductor-only, not a Codex text-edit task.
- Follow existing file conventions exactly: `'use client'` components use `@/lib/supabase-browser`; server pages use `@/lib/supabase-server`.
- No new npm dependencies.
- Source spec: `docs/superpowers/specs/2026-07-15-client-sites-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-104-client-sites.sql`

**Interfaces:**
- Produces: table `public.client_sites` (columns: `id`, `client_id`, `label`, `address`, `contact_name`, `contact_phone`, `access_notes`, `is_archived`, `created_by`, `created_at`); new nullable columns `public.sessions.site_id`, `public.incident_reports.client_id`, `public.incident_reports.site_id`.

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 104: Client Sites
-- Multi-site support for the Trades & Field Services deep-dive. Lets a
-- client have more than one physical address (a landlord, strata manager,
-- or multi-branch commercial account). Gated in the UI by the
-- `supportsMultiSite` workspace-profile flag, not by RLS — rows can exist
-- for any org, same as `students` existing for every profile even though
-- only tutoring's UI currently surfaces them. Run via Supabase MCP
-- apply_migration (name: client_sites)
-- ============================================================

create table public.client_sites (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients on delete cascade,
  label         text not null,
  address       text not null,
  contact_name  text,
  contact_phone text,
  access_notes  text,
  is_archived   boolean not null default false,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.client_sites enable row level security;

create policy "Owners can manage sites of their own clients"
  on public.client_sites for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_sites.client_id and c.owner_id = auth.uid()
    )
  );

create policy "Org members can view sites of org clients"
  on public.client_sites for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_sites.client_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage sites of org clients"
  on public.client_sites for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_sites.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create index client_sites_client on public.client_sites (client_id);

alter table public.sessions
  add column site_id uuid references public.client_sites on delete set null;

alter table public.incident_reports
  add column client_id uuid references public.clients on delete set null,
  add column site_id uuid references public.client_sites on delete set null;
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `project_id: sdwwlnnsijcadkdwsvud`, `name: client_sites`, and the SQL above.

- [ ] **Step 3: Sanity-check queries**

Run via `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable from information_schema.columns where table_name = 'client_sites' order by ordinal_position;
select column_name from information_schema.columns where table_name = 'sessions' and column_name = 'site_id';
select column_name from information_schema.columns where table_name = 'incident_reports' and column_name in ('client_id', 'site_id');
select policyname from pg_policies where tablename = 'client_sites';
```
Expected: `client_sites` has all 10 columns; `sessions` has `site_id`; `incident_reports` has both new columns; 3 policies exist on `client_sites`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-104-client-sites.sql
git commit -m "handover: C-1 client_sites schema + RLS"
```

---

### Task 2: Types

**Files:**
- Create: `src/types/client-sites.ts`
- Modify: `src/types/incident-reports.ts:5-28`

**Interfaces:**
- Consumes: nothing (pure type definitions).
- Produces: `ClientSite` type (used by Tasks 4, 5, 6, 7, 8, 9); `IncidentReport.client_id`/`.site_id` fields (used by Tasks 8, 9).

- [ ] **Step 1: Create the ClientSite type**

`src/types/client-sites.ts`:
```typescript
export type ClientSite = {
  id: string
  client_id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Add client_id/site_id to IncidentReport**

In `src/types/incident-reports.ts`, the `IncidentReport` type currently reads:
```typescript
export type IncidentReport = {
  id: string
  org_id: string
  type: IncidentType
  severity: IncidentSeverity
  occurred_at: string
  location: string | null
  description: string
  employee_id: string | null
  ...
```
Change the `location` line to add two new fields immediately after it:
```typescript
export type IncidentReport = {
  id: string
  org_id: string
  type: IncidentType
  severity: IncidentSeverity
  occurred_at: string
  location: string | null
  client_id: string | null
  site_id: string | null
  description: string
  employee_id: string | null
  ...
```
(Leave every other field in the type unchanged.)

- [ ] **Step 3: Commit**

```bash
git add src/types/client-sites.ts src/types/incident-reports.ts
git commit -m "handover: C-2 client site + incident report types"
```

---

### Task 3: Workspace profile flag

**Files:**
- Modify: `src/lib/workspace-profiles/types.ts:25-30`
- Modify: `src/lib/workspace-profiles/registry.ts:40-46`

**Interfaces:**
- Produces: `WorkspaceProfileConfig.supportsMultiSite?: boolean`, `true` for exactly `trades_field_services`, `builder_construction`, `cleaning_maintenance`, `real_estate`. Consumed by Tasks 6 (client detail page gating).

- [ ] **Step 1: Add the field to the type**

In `src/lib/workspace-profiles/types.ts`, the `WorkspaceProfileConfig` type currently reads:
```typescript
export type WorkspaceProfileConfig = {
  key: WorkspaceProfileKey
  label: string
  terminology: Terminology
  navOverrides?: NavOverrides
}
```
Change to:
```typescript
export type WorkspaceProfileConfig = {
  key: WorkspaceProfileKey
  label: string
  terminology: Terminology
  navOverrides?: NavOverrides
  supportsMultiSite?: boolean
}
```

- [ ] **Step 2: Set it true for the four gated profiles**

In `src/lib/workspace-profiles/registry.ts`, these four lines currently read:
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
```
Change to add `supportsMultiSite: true` on `builder_construction`, `trades_field_services`, `real_estate`, `cleaning_maintenance` only (not `consulting`):
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
```

- [ ] **Step 3: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "handover: C-3 supportsMultiSite workspace profile flag"`

---

### Task 4: Site CRUD API route

**Files:**
- Create: `src/app/api/client-sites/[id]/route.ts`

**Interfaces:**
- Consumes: `ClientSite` type (Task 2).
- Produces: `PATCH /api/client-sites/[id]` (body with `label` → field edit; body with `is_archived` → archive toggle/restore), `DELETE /api/client-sites/[id]` (archive). Mirrors `src/app/api/students/[id]/route.ts` exactly. Consumed by Task 5's `EditSiteModal`, `DeleteSiteButton`, `RestoreSiteButton`.

- [ ] **Step 1: Create the route, mirroring `/api/students/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

async function getOwnerIdForSite(supabase: Awaited<ReturnType<typeof createClient>>, siteId: string) {
  const { data } = await supabase
    .from('client_sites')
    .select('id, clients(owner_id)')
    .eq('id', siteId)
    .maybeSingle()
  const client = (data?.clients as unknown as { owner_id: string } | null)
  return { exists: !!data, ownerId: client?.owner_id ?? null }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForSite(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  // Field-edit path — triggered when body contains 'label'
  if ('label' in body) {
    const { label, address, contact_name, contact_phone, access_notes } = body as {
      label: string
      address: string
      contact_name?: string | null
      contact_phone?: string | null
      access_notes?: string | null
    }
    if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    if (!address?.trim()) return NextResponse.json({ error: 'Address is required' }, { status: 400 })

    const { error } = await supabase.from('client_sites').update({
      label: label.trim(),
      address: address.trim(),
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,
      access_notes: access_notes || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Archive toggle path (e.g. restoring an archived site)
  const { error } = await supabase
    .from('client_sites').update({ is_archived: body.is_archived ?? false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForSite(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('client_sites').update({ is_archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/api/client-sites/[id]/route.ts && git commit -m "handover: C-4 client sites CRUD API route"`

---

### Task 5: Site CRUD UI components

**Files:**
- Create: `src/components/client-sites/SiteForm.tsx`
- Create: `src/components/client-sites/EditSiteButton.tsx`
- Create: `src/components/client-sites/EditSiteModal.tsx`
- Create: `src/components/client-sites/DeleteSiteButton.tsx`
- Create: `src/components/client-sites/RestoreSiteButton.tsx`

**Interfaces:**
- Consumes: `/api/client-sites/[id]` (Task 4).
- Produces: `<SiteForm clientId siteId? defaultOpen?>`, `<EditSiteButton site>`, `<DeleteSiteButton siteId siteLabel>`, `<RestoreSiteButton siteId>` — consumed by Task 6's `sites/page.tsx`.

- [ ] **Step 1: Create SiteForm (insert), mirroring `StudentForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function SiteForm({ clientId, defaultOpen = false }: { clientId: string; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('client_sites').insert({
      client_id: clientId,
      label,
      address,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      access_notes: accessNotes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setLabel(''); setAddress(''); setContactName(''); setContactPhone(''); setAccessNotes('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
        {open ? 'Cancel' : '+ Add site'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Label *</label>
            <input required type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Warehouse"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address *</label>
            <input required type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 42 Industrial Rd, Dandenong VIC"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact name</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
              placeholder="If different from the client"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact phone</label>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Access notes</label>
            <textarea value={accessNotes} onChange={e => setAccessNotes(e.target.value)} rows={3}
              placeholder="Gate code, key location, parking instructions"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save site'}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create EditSiteButton + EditSiteModal, mirroring `EditStudentButton.tsx`/`EditStudentModal.tsx`**

`src/components/client-sites/EditSiteButton.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditSiteModal from './EditSiteModal'

type Site = {
  id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
}

export default function EditSiteButton({ site }: { site: Site }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && <EditSiteModal site={site} onClose={() => setOpen(false)} />}
    </>
  )
}
```

`src/components/client-sites/EditSiteModal.tsx`:
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Site = {
  id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
}

export default function EditSiteModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const router = useRouter()
  const [label, setLabel] = useState(site.label)
  const [address, setAddress] = useState(site.address)
  const [contactName, setContactName] = useState(site.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(site.contact_phone ?? '')
  const [accessNotes, setAccessNotes] = useState(site.access_notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/client-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        address,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        access_notes: accessNotes || null,
      }),
    })
    if (res.ok) {
      onClose()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to save')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit site</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Label *</label>
            <input ref={firstRef} required type="text" value={label} onChange={e => setLabel(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address *</label>
            <input required type="text" value={address} onChange={e => setAddress(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact name</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact phone</label>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Access notes</label>
            <textarea value={accessNotes} onChange={e => setAccessNotes(e.target.value)} rows={3}
              className={`resize-none ${inputCls}`} />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create DeleteSiteButton (archive), mirroring `DeleteStudentButton.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteSiteButton({ siteId, siteLabel }: { siteId: string; siteLabel: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleArchive() {
    setLoading(true)
    const res = await fetch(`/api/client-sites/${siteId}`, { method: 'DELETE' })
    setOpen(false)
    if (res.ok) {
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Archive
      </button>

      <ConfirmDialog
        open={open}
        title={`Archive ${siteLabel}?`}
        message={`${siteLabel} will be removed from the active site list. Existing sessions and incident reports that reference it are preserved.`}
        confirmLabel="Archive site"
        onConfirm={handleArchive}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
```

- [ ] **Step 4: Create RestoreSiteButton, mirroring `RestoreStudentButton.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

export default function RestoreSiteButton({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRestore() {
    setLoading(true)
    await fetch(`/api/client-sites/${siteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: false }),
    })
    router.refresh()
  }

  return (
    <button
      onClick={handleRestore}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {loading ? 'Restoring…' : 'Restore'}
    </button>
  )
}
```

- [ ] **Step 5: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/client-sites/ && git commit -m "handover: C-5 site CRUD UI components"`

---

### Task 6: Client Sites page + client detail page tile

**Files:**
- Create: `src/app/dashboard/clients/[id]/sites/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `SiteForm`, `EditSiteButton`, `DeleteSiteButton`, `RestoreSiteButton` (Task 5); `WorkspaceProfileConfig.supportsMultiSite` (Task 3).

- [ ] **Step 1: Create the sites list page, mirroring `clients/[id]/students/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import SiteForm from '@/components/client-sites/SiteForm'
import EditSiteButton from '@/components/client-sites/EditSiteButton'
import DeleteSiteButton from '@/components/client-sites/DeleteSiteButton'
import RestoreSiteButton from '@/components/client-sites/RestoreSiteButton'

export default async function ClientSitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = await params
  const { new: openNew } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name, owner_id').eq('id', id).maybeSingle()
  if (!client) notFound()
  const canEdit = isAdmin || client.owner_id === user.id

  const [{ data: sites }, { data: archivedSites }] = await Promise.all([
    supabase
      .from('client_sites')
      .select('id, label, address, contact_name, contact_phone, access_notes')
      .eq('client_id', id)
      .eq('is_archived', false)
      .order('label'),
    canEdit
      ? supabase.from('client_sites').select('id, label').eq('client_id', id).eq('is_archived', true).order('label')
      : Promise.resolve({ data: [] }),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sites</h1>

        {canEdit && <SiteForm clientId={id} defaultOpen={openNew === '1'} />}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {(sites ?? []).length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-slate-500">No sites yet. Add the first one.</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-slate-800">
              {(sites ?? []).map(s => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.label}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">{s.address}</p>
                    {(s.contact_name || s.contact_phone) && (
                      <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-slate-500">
                        {[s.contact_name, s.contact_phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <EditSiteButton site={s} />
                      <DeleteSiteButton siteId={s.id} siteLabel={s.label} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit && (archivedSites ?? []).length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-400">Archived ({(archivedSites ?? []).length})</h2>
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                {(archivedSites ?? []).map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">{s.label}</p>
                    <RestoreSiteButton siteId={s.id} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add a gated "Sites" tile to the client detail page**

In `src/app/dashboard/clients/[id]/page.tsx`, the import line currently reads:
```typescript
import { FolderKanban, CalendarClock, NotebookPen, ScrollText, FileText, Banknote, Mail, GraduationCap } from 'lucide-react'
```
Add `MapPin`:
```typescript
import { FolderKanban, CalendarClock, NotebookPen, ScrollText, FileText, Banknote, Mail, GraduationCap, MapPin } from 'lucide-react'
```

The destructure currently reads:
```typescript
  const { terminology, key: profileKey } = await getWorkspaceProfileForUser(supabase, user.id)
```
Change to:
```typescript
  const { terminology, key: profileKey, supportsMultiSite } = await getWorkspaceProfileForUser(supabase, user.id)
```

The student-count block currently reads:
```typescript
  let studentCount = 0
  if (profileKey === 'tutoring') {
    const { count } = await supabase
      .from('students').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('archived', false)
    studentCount = count ?? 0
  }
```
Add a site-count block immediately after it:
```typescript
  let studentCount = 0
  if (profileKey === 'tutoring') {
    const { count } = await supabase
      .from('students').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('archived', false)
    studentCount = count ?? 0
  }

  let siteCount = 0
  if (supportsMultiSite) {
    const { count } = await supabase
      .from('client_sites').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('is_archived', false)
    siteCount = count ?? 0
  }
```

The Students tile currently reads:
```typescript
            {profileKey === 'tutoring' && (
              <Tile title="Students" icon={GraduationCap} accent="#16a34a" stat={studentCount} href={`/dashboard/clients/${id}/students`} />
            )}
```
Add the Sites tile immediately after it:
```typescript
            {profileKey === 'tutoring' && (
              <Tile title="Students" icon={GraduationCap} accent="#16a34a" stat={studentCount} href={`/dashboard/clients/${id}/students`} />
            )}
            {supportsMultiSite && (
              <Tile title="Sites" icon={MapPin} accent="#ea580c" stat={siteCount} href={`/dashboard/clients/${id}/sites`} />
            )}
```

- [ ] **Step 3: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades-profile client, confirm the "Sites" tile appears and links to a working add/edit/archive/restore flow; as a tutoring-profile client, confirm no "Sites" tile appears.
- [ ] Commit: `git add src/app/dashboard/clients/[id]/sites/page.tsx src/app/dashboard/clients/[id]/page.tsx && git commit -m "handover: C-6 client sites page and detail-page tile"`

---

### Task 7: Session booking site picker

**Files:**
- Modify: `src/components/clients/NewSessionModal.tsx`
- Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`

**Interfaces:**
- Consumes: `client_sites` table (Task 1).
- Produces: `sessions.site_id` set on session creation via the non-recurring path.

**Note:** The existing recurring-session path (`POST /api/clients/[id]/sessions/series`) already drops `studentId`/`yearGroup`/`subjectId`/`topicId` silently — that route's handler only destructures `{ title, scheduledAt, durationMinutes, recurrenceInterval }` even though the modal sends the rest. This is a pre-existing gap, not introduced here. `site_id` follows the same precedent: wired into the direct (non-recurring) insert only, not the recurring series path. Do not attempt to fix the recurring path in this task — out of scope.

- [ ] **Step 1: Add a `sites` prop and Location picker to NewSessionModal**

In `src/components/clients/NewSessionModal.tsx`, the type aliases near the top currently read:
```typescript
type Template = { id: string; title: string; position: number }
type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'
type StudentOption = { id: string; name: string }
type SubjectOption = { id: string; name: string }
type TopicOption = { id: string; name: string }
```
Add:
```typescript
type Template = { id: string; title: string; position: number }
type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'
type StudentOption = { id: string; name: string }
type SubjectOption = { id: string; name: string }
type TopicOption = { id: string; name: string }
type SiteOption = { id: string; label: string }
```

The props signature currently reads:
```typescript
export default function NewSessionModal({
  clientId,
  orgId,
  clientLabel,
  students,
  subjects,
  defaultOpen = false,
}: {
  clientId: string
  orgId: string | null
  clientLabel: { singular: string; plural: string }
  students: StudentOption[]
  subjects: SubjectOption[]
  defaultOpen?: boolean
}) {
```
Change to:
```typescript
export default function NewSessionModal({
  clientId,
  orgId,
  clientLabel,
  students,
  subjects,
  sites,
  defaultOpen = false,
}: {
  clientId: string
  orgId: string | null
  clientLabel: { singular: string; plural: string }
  students: StudentOption[]
  subjects: SubjectOption[]
  sites: SiteOption[]
  defaultOpen?: boolean
}) {
```

The state block currently includes `const [studentId, setStudentId] = useState('')` — add a sibling right after it:
```typescript
  const [studentId, setStudentId] = useState('')
  const [siteId, setSiteId] = useState('')
```

The direct-insert `supabase.from('sessions').insert({...})` call currently reads:
```typescript
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        org_id: orgId,
        created_by: user.id,
        title: title.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        status: 'scheduled',
        student_id: studentId || null,
        year_group: yearGroup || null,
        subject_id: resolvedSubjectId,
        topic_id: resolvedTopicId,
      })
      .select('id')
      .single()
```
Add `site_id: siteId || null` to the insert object:
```typescript
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        org_id: orgId,
        created_by: user.id,
        title: title.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        status: 'scheduled',
        student_id: studentId || null,
        year_group: yearGroup || null,
        subject_id: resolvedSubjectId,
        topic_id: resolvedTopicId,
        site_id: siteId || null,
      })
      .select('id')
      .single()
```

The student-picker conditional block currently reads:
```typescript
          {students.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Student</label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— Select student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
```
Add a Location block immediately after it:
```typescript
          {students.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Student</label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— Select student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {sites.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Location</label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">{clientLabel.singular}&apos;s main address</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
```

- [ ] **Step 2: Fetch sites and pass them into NewSessionModal**

In `src/app/dashboard/clients/[id]/sessions/page.tsx`, the students query currently reads:
```typescript
  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')
```
Add a sites query immediately after it:
```typescript
  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const { data: sites } = await supabase
    .from('client_sites')
    .select('id, label')
    .eq('client_id', id)
    .eq('is_archived', false)
    .order('label')
```
The `<NewSessionModal>` call currently reads:
```typescript
          <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} subjects={subjects ?? []} defaultOpen={openNew === '1'} />
```
Add the `sites` prop:
```typescript
          <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} subjects={subjects ?? []} sites={sites ?? []} defaultOpen={openNew === '1'} />
```

- [ ] **Step 3: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: for a client with 2+ active sites, booking a session shows the Location dropdown defaulting to "[Client]'s main address"; picking a site and saving persists `site_id` correctly (check via `execute_sql`). For a client with zero sites, no Location dropdown appears and the form behaves exactly as before.
- [ ] Commit: `git add src/components/clients/NewSessionModal.tsx src/app/dashboard/clients/[id]/sessions/page.tsx && git commit -m "handover: C-7 session booking site picker"`

---

### Task 8: ClientSitePicker + wire into the new incident report form

**Files:**
- Create: `src/components/incident-reports/ClientSitePicker.tsx`
- Modify: `src/components/incident-reports/IncidentReportsView.tsx`
- Modify: `src/app/dashboard/incident-reports/page.tsx`

**Interfaces:**
- Consumes: `client_sites` table (Task 1).
- Produces: `<ClientSitePicker clients clientId siteId onClientChange onSiteChange>` — a shared component also consumed by Task 9's `IncidentReportDetailClient`. `ClientOption = { id: string; name: string }` type, exported from this file.

- [ ] **Step 1: Create ClientSitePicker**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export type ClientOption = { id: string; name: string }
type SiteOption = { id: string; label: string }

export default function ClientSitePicker({
  clients,
  clientId,
  siteId,
  onClientChange,
  onSiteChange,
}: {
  clients: ClientOption[]
  clientId: string
  siteId: string
  onClientChange: (clientId: string) => void
  onSiteChange: (siteId: string) => void
}) {
  const [sites, setSites] = useState<SiteOption[]>([])
  const isFirstRun = useRef(true)

  useEffect(() => {
    // Skip the reset on mount — this component is reused by the incident
    // report *edit* form, which initializes clientId/siteId from an
    // existing report. Resetting siteId here on mount would silently wipe
    // that saved selection before the user touches anything. Only actual
    // client changes (this effect re-firing after mount) should clear it.
    if (isFirstRun.current) {
      isFirstRun.current = false
    } else {
      onSiteChange('')
    }
    if (!clientId) { setSites([]); return }
    const supabase = createClient()
    supabase
      .from('client_sites')
      .select('id, label')
      .eq('client_id', clientId)
      .eq('is_archived', false)
      .order('label')
      .then(({ data }) => setSites(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  return (
    <>
      <label className="space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Client</span>
        <select value={clientId} onChange={e => onClientChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <option value="">No specific client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {sites.length > 0 && (
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Site</span>
          <select value={siteId} onChange={e => onSiteChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <option value="">Client&apos;s main address</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
    </>
  )
}
```
(The effect intentionally omits `onSiteChange`/`onClientChange` from the dependency array — including them would re-run the effect and clear the site selection on every parent re-render, since inline arrow-function props are a new reference each render. This mirrors the same omission pattern already used elsewhere in this codebase, e.g. `NewSessionModal`'s own template-fetching `useEffect`.)

- [ ] **Step 2: Wire it into IncidentReportsView's new-report form**

In `src/components/incident-reports/IncidentReportsView.tsx`, the imports currently read:
```typescript
import { TYPE_LABEL, SEVERITY_LABEL, SEVERITY_COLOUR, STATUS_LABEL, STATUS_COLOUR } from '@/lib/incident-reports'
import type { IncidentReport, IncidentType, IncidentSeverity } from '@/types/incident-reports'
```
Add:
```typescript
import { TYPE_LABEL, SEVERITY_LABEL, SEVERITY_COLOUR, STATUS_LABEL, STATUS_COLOUR } from '@/lib/incident-reports'
import type { IncidentReport, IncidentType, IncidentSeverity } from '@/types/incident-reports'
import ClientSitePicker, { type ClientOption } from './ClientSitePicker'
```

The component signature currently reads:
```typescript
export default function IncidentReportsView({
  reports,
  orgId,
  members,
  canManage,
}: {
  reports: IncidentReport[]
  orgId: string
  members: OrgMemberOption[]
  canManage: boolean
}) {
```
Change to:
```typescript
export default function IncidentReportsView({
  reports,
  orgId,
  members,
  clients,
  canManage,
}: {
  reports: IncidentReport[]
  orgId: string
  members: OrgMemberOption[]
  clients: ClientOption[]
  canManage: boolean
}) {
```

The form-state block currently reads:
```typescript
  const [type, setType] = useState<IncidentType>('injury')
  const [severity, setSeverity] = useState<IncidentSeverity>('minor')
  const [occurredAt, setOccurredAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [witnessIds, setWitnessIds] = useState<string[]>([])
```
Add a sibling pair:
```typescript
  const [type, setType] = useState<IncidentType>('injury')
  const [severity, setSeverity] = useState<IncidentSeverity>('minor')
  const [occurredAt, setOccurredAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [witnessIds, setWitnessIds] = useState<string[]>([])
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
```

`resetForm` currently reads:
```typescript
  function resetForm() {
    setType('injury'); setSeverity('minor'); setOccurredAt(''); setLocation('')
    setDescription(''); setEmployeeId(''); setWitnessIds([]); setError(null)
  }
```
Change to:
```typescript
  function resetForm() {
    setType('injury'); setSeverity('minor'); setOccurredAt(''); setLocation('')
    setDescription(''); setEmployeeId(''); setWitnessIds([]); setClientId(''); setSiteId(''); setError(null)
  }
```

The insert call in `handleSubmit` currently reads:
```typescript
    const { error: insertError } = await supabase.from('incident_reports').insert({
      org_id: orgId,
      type,
      severity,
      occurred_at: new Date(occurredAt).toISOString(),
      location: location.trim() || null,
      description: description.trim(),
      employee_id: employeeId || null,
      witness_ids: witnessIds,
      filed_by: user.id,
    })
```
Add `client_id`/`site_id`:
```typescript
    const { error: insertError } = await supabase.from('incident_reports').insert({
      org_id: orgId,
      type,
      severity,
      occurred_at: new Date(occurredAt).toISOString(),
      location: location.trim() || null,
      client_id: clientId || null,
      site_id: siteId || null,
      description: description.trim(),
      employee_id: employeeId || null,
      witness_ids: witnessIds,
      filed_by: user.id,
    })
```

The Location field in the form JSX currently reads:
```typescript
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
```
Add `<ClientSitePicker>` immediately after it:
```typescript
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <ClientSitePicker clients={clients} clientId={clientId} siteId={siteId} onClientChange={setClientId} onSiteChange={setSiteId} />
```

- [ ] **Step 3: Fetch the org's clients and pass them down**

In `src/app/dashboard/incident-reports/page.tsx`, the parallel fetch currently reads:
```typescript
  const [{ data: reports }, { data: members }] = await Promise.all([
    supabase
      .from('incident_reports')
      .select('*')
      .eq('org_id', orgId)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId),
  ])
```
Add a third parallel query:
```typescript
  const [{ data: reports }, { data: members }, { data: clients }] = await Promise.all([
    supabase
      .from('incident_reports')
      .select('*')
      .eq('org_id', orgId)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId),
    supabase
      .from('clients')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('archived', false)
      .order('name'),
  ])
```
The render call currently reads:
```typescript
        <IncidentReportsView reports={reportList} orgId={orgId} members={memberOptions} canManage={isManager} />
```
Add the `clients` prop:
```typescript
        <IncidentReportsView reports={reportList} orgId={orgId} members={memberOptions} clients={clients ?? []} canManage={isManager} />
```

- [ ] **Step 4: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/incident-reports/ClientSitePicker.tsx src/components/incident-reports/IncidentReportsView.tsx src/app/dashboard/incident-reports/page.tsx && git commit -m "handover: C-8 client/site picker on new incident reports"`

---

### Task 9: Wire client/site into the incident report detail, edit, and print views

**Files:**
- Modify: `src/components/incident-reports/IncidentReportDetailClient.tsx`
- Modify: `src/app/dashboard/incident-reports/[id]/page.tsx`
- Modify: `src/app/dashboard/incident-reports/[id]/print/page.tsx`

**Interfaces:**
- Consumes: `ClientSitePicker`, `ClientOption` (Task 8); `IncidentReport.client_id`/`.site_id` (Task 2).

- [ ] **Step 1: Add client/site editing and display to IncidentReportDetailClient**

In `src/components/incident-reports/IncidentReportDetailClient.tsx`, the imports currently read:
```typescript
import { SEVERITY_COLOUR, SEVERITY_LABEL, STATUS_COLOUR, STATUS_LABEL, TYPE_LABEL } from '@/lib/incident-reports'
import type { IncidentReport, IncidentReportPhoto, IncidentSeverity, IncidentType } from '@/types/incident-reports'
```
Add:
```typescript
import { SEVERITY_COLOUR, SEVERITY_LABEL, STATUS_COLOUR, STATUS_LABEL, TYPE_LABEL } from '@/lib/incident-reports'
import type { IncidentReport, IncidentReportPhoto, IncidentSeverity, IncidentType } from '@/types/incident-reports'
import ClientSitePicker, { type ClientOption } from './ClientSitePicker'
```

The component signature currently reads:
```typescript
export default function IncidentReportDetailClient({
  report,
  photos,
  members,
  canManage,
  userId,
}: {
  report: IncidentReport
  photos: IncidentPhotoWithUrl[]
  members: OrgMemberOption[]
  canManage: boolean
  userId: string
}) {
```
Change to:
```typescript
export default function IncidentReportDetailClient({
  report,
  photos,
  members,
  clients,
  clientName,
  siteLabel,
  canManage,
  userId,
}: {
  report: IncidentReport
  photos: IncidentPhotoWithUrl[]
  members: OrgMemberOption[]
  clients: ClientOption[]
  clientName: string | null
  siteLabel: string | null
  canManage: boolean
  userId: string
}) {
```

The state block currently includes `const [employeeId, setEmployeeId] = useState(report.employee_id ?? '')` — add a sibling pair right after it:
```typescript
  const [employeeId, setEmployeeId] = useState(report.employee_id ?? '')
  const [clientId, setClientId] = useState(report.client_id ?? '')
  const [siteId, setSiteId] = useState(report.site_id ?? '')
```

The `saveReport` update payload currently reads:
```typescript
      .update({
        type,
        severity,
        occurred_at: new Date(occurredAt).toISOString(),
        location: location.trim() || null,
        description: description.trim(),
        employee_id: employeeId || null,
        witness_ids: witnessIds,
        body_part: type === 'injury' ? bodyPart.trim() || null : null,
        first_aid_given: type === 'injury' ? firstAidGiven : null,
        medical_treatment_required: type === 'injury' ? medicalTreatmentRequired : null,
        time_off_work: type === 'injury' ? timeOffWork : null,
        root_cause: rootCause.trim() || null,
        corrective_action: correctiveAction.trim() || null,
      })
```
Add `client_id`/`site_id`:
```typescript
      .update({
        type,
        severity,
        occurred_at: new Date(occurredAt).toISOString(),
        location: location.trim() || null,
        client_id: clientId || null,
        site_id: siteId || null,
        description: description.trim(),
        employee_id: employeeId || null,
        witness_ids: witnessIds,
        body_part: type === 'injury' ? bodyPart.trim() || null : null,
        first_aid_given: type === 'injury' ? firstAidGiven : null,
        medical_treatment_required: type === 'injury' ? medicalTreatmentRequired : null,
        time_off_work: type === 'injury' ? timeOffWork : null,
        root_cause: rootCause.trim() || null,
        corrective_action: correctiveAction.trim() || null,
      })
```

The edit-mode Location field currently reads:
```typescript
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
```
Add `<ClientSitePicker>` immediately after it:
```typescript
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <ClientSitePicker clients={clients} clientId={clientId} siteId={siteId} onClientChange={setClientId} onSiteChange={setSiteId} />
```

The read-only `<dl>` block currently reads:
```typescript
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <ReadOnlyItem label="Type" value={TYPE_LABEL[report.type]} />
        <ReadOnlyItem label="Severity" value={SEVERITY_LABEL[report.severity]} />
        <ReadOnlyItem label="Date and time" value={displayDateTime(report.occurred_at)} />
        <ReadOnlyItem label="Location" value={report.location ?? '-'} />
        <ReadOnlyItem label="Employee involved" value={memberName(report.employee_id)} />
```
Add a Client/Site item right after Location:
```typescript
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <ReadOnlyItem label="Type" value={TYPE_LABEL[report.type]} />
        <ReadOnlyItem label="Severity" value={SEVERITY_LABEL[report.severity]} />
        <ReadOnlyItem label="Date and time" value={displayDateTime(report.occurred_at)} />
        <ReadOnlyItem label="Location" value={report.location ?? '-'} />
        <ReadOnlyItem label="Client / site" value={clientName ? (siteLabel ? `${clientName} — ${siteLabel}` : clientName) : '-'} />
        <ReadOnlyItem label="Employee involved" value={memberName(report.employee_id)} />
```

- [ ] **Step 2: Resolve and pass client/site data from the detail server page**

In `src/app/dashboard/incident-reports/[id]/page.tsx`, the parallel fetch currently reads:
```typescript
  const [{ data: membership }, { data: members }, { data: photos }] = await Promise.all([
    supabase
      .from('organisation_members')
      .select('role')
      .eq('org_id', currentReport.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentReport.org_id),
    supabase
      .from('incident_report_photos')
      .select('*')
      .eq('incident_report_id', currentReport.id)
      .order('created_at', { ascending: true }),
  ])
```
Add a fourth parallel query for the org's clients:
```typescript
  const [{ data: membership }, { data: members }, { data: photos }, { data: clients }] = await Promise.all([
    supabase
      .from('organisation_members')
      .select('role')
      .eq('org_id', currentReport.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentReport.org_id),
    supabase
      .from('incident_report_photos')
      .select('*')
      .eq('incident_report_id', currentReport.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('clients')
      .select('id, name')
      .eq('org_id', currentReport.org_id)
      .eq('archived', false)
      .order('name'),
  ])
```
Immediately before the `return (` line, add resolution of `clientName`/`siteLabel`:
```typescript
  const clientOptions = clients ?? []
  const clientName = currentReport.client_id
    ? clientOptions.find(c => c.id === currentReport.client_id)?.name ?? null
    : null

  let siteLabel: string | null = null
  if (currentReport.site_id) {
    const { data: site } = await supabase.from('client_sites').select('label').eq('id', currentReport.site_id).maybeSingle()
    siteLabel = site?.label ?? null
  }
```
The `<IncidentReportDetailClient>` call currently reads:
```typescript
        <IncidentReportDetailClient
          report={currentReport}
          photos={signedPhotos}
          members={memberOptions}
          canManage={canManage}
          userId={user.id}
        />
```
Add the three new props:
```typescript
        <IncidentReportDetailClient
          report={currentReport}
          photos={signedPhotos}
          members={memberOptions}
          clients={clientOptions}
          clientName={clientName}
          siteLabel={siteLabel}
          canManage={canManage}
          userId={user.id}
        />
```

- [ ] **Step 3: Show client/site on the print page**

In `src/app/dashboard/incident-reports/[id]/print/page.tsx`, right after the `nameById`/`name` helper block (which currently ends with `const name = (id: string | null) => (id ? nameById.get(id) ?? 'Unknown' : '—')`), add resolution:
```typescript
  const name = (id: string | null) => (id ? nameById.get(id) ?? 'Unknown' : '—')

  let clientName: string | null = null
  let siteLabel: string | null = null
  if (currentReport.client_id) {
    const { data: client } = await supabase.from('clients').select('name').eq('id', currentReport.client_id).maybeSingle()
    clientName = client?.name ?? null
  }
  if (currentReport.site_id) {
    const { data: site } = await supabase.from('client_sites').select('label').eq('id', currentReport.site_id).maybeSingle()
    siteLabel = site?.label ?? null
  }
```
The `.meta` grid currently reads:
```typescript
        <div className="meta">
          <div>
            <div className="meta-label">Type</div>
            <div className="meta-value">{TYPE_LABEL[currentReport.type]}</div>
          </div>
          <div>
            <div className="meta-label">Severity</div>
            <div className="meta-value">{SEVERITY_LABEL[currentReport.severity]}</div>
          </div>
          <div>
            <div className="meta-label">Date &amp; time</div>
            <div className="meta-value">{fmtDateTime(currentReport.occurred_at)}</div>
          </div>
          <div>
            <div className="meta-label">Location</div>
            <div className="meta-value">{currentReport.location ?? '—'}</div>
          </div>
          <div>
            <div className="meta-label">Employee involved</div>
            <div className="meta-value">{name(currentReport.employee_id)}</div>
          </div>
          <div>
            <div className="meta-label">Filed by</div>
            <div className="meta-value">{name(currentReport.filed_by)}</div>
          </div>
        </div>
```
Add a Client cell right after Location (only rendered when set, since the grid is `1fr 1fr 1fr` and a missing cell just leaves a gap on the last row, matching how other conditional sections on this page already behave):
```typescript
        <div className="meta">
          <div>
            <div className="meta-label">Type</div>
            <div className="meta-value">{TYPE_LABEL[currentReport.type]}</div>
          </div>
          <div>
            <div className="meta-label">Severity</div>
            <div className="meta-value">{SEVERITY_LABEL[currentReport.severity]}</div>
          </div>
          <div>
            <div className="meta-label">Date &amp; time</div>
            <div className="meta-value">{fmtDateTime(currentReport.occurred_at)}</div>
          </div>
          <div>
            <div className="meta-label">Location</div>
            <div className="meta-value">{currentReport.location ?? '—'}</div>
          </div>
          {clientName && (
            <div>
              <div className="meta-label">Client</div>
              <div className="meta-value">{clientName}{siteLabel ? ` — ${siteLabel}` : ''}</div>
            </div>
          )}
          <div>
            <div className="meta-label">Employee involved</div>
            <div className="meta-value">{name(currentReport.employee_id)}</div>
          </div>
          <div>
            <div className="meta-label">Filed by</div>
            <div className="meta-value">{name(currentReport.filed_by)}</div>
          </div>
        </div>
```

- [ ] **Step 4: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: file an incident report with a client and site selected; confirm it saves; open the detail page and confirm "Client / site" reads correctly in both view and edit mode; open the print view and confirm the Client cell appears; edit an existing report to change its client/site and confirm the change persists.
- [ ] Commit: `git add src/components/incident-reports/IncidentReportDetailClient.tsx src/app/dashboard/incident-reports/[id]/page.tsx src/app/dashboard/incident-reports/[id]/print/page.tsx && git commit -m "handover: C-9 client/site on incident report detail, edit, and print views"`

---

## Verification

- `pnpm run build` must pass clean after every task (this project's only gate — no test runner).
- Full manual smoke, as a trades-profile org (per the design doc):
  1. Add two sites to an existing client via the new "Sites" tile; confirm the client's existing billing address is untouched.
  2. Book a new session for that client — confirm the Location dropdown appears, defaults to "[Client]'s main address," and saving with a site picked persists `site_id`.
  3. File an incident report, pick that client, then that site; confirm it saves and displays correctly on the detail/edit/print views.
  4. Archive a site; confirm it no longer appears in the Location dropdown for new sessions but past sessions that reference it still display correctly (no crash from a since-archived `site_id`).
- As a tutoring-profile org: confirm the client detail page shows no "Sites" section at all, and the session-booking modal shows no Location dropdown (tutoring clients have zero sites, so this falls out naturally rather than needing an explicit gate at that layer).
