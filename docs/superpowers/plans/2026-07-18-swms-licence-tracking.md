# SWMS + Licence Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project crew management, SWMS (Safe Work Method Statement) document tracking with
per-crew-member acknowledgment, and a small polish pass on the existing Certifications feature
(document upload + Dashboard surfacing) — gated to Builder & Construction and Trades & Field
Services.

**Architecture:** Two new tables (`project_swms_documents`, `project_swms_acknowledgments`) plus
RLS for the existing-but-unused `project_members` table, all following the exact indirection
pattern already used by `project_documents`' RLS (which already references `project_members`, even
though nothing populates it today). A new private `project-swms` storage bucket mirrors the
existing `project-documents` bucket's path-prefix RLS pattern. Certifications gets a document
upload wired into the already-existing (but empty, zero-policy) `employee-docs` bucket. All new UI
is plain `supabase.from(...)` calls in `'use client'` components, matching this repo's established
convention.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind v4.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- Migration file: `supabase/schema-105-swms-crew-tracking.sql`, applied via Supabase MCP
  `apply_migration` (name: `swms_crew_tracking`) — conductor-only, not a Codex text-edit task.
- Follow existing file conventions exactly: `'use client'` components use
  `@/lib/supabase-browser`; server pages use `@/lib/supabase-server`.
- No new npm dependencies.
- Source spec: `docs/superpowers/specs/2026-07-18-swms-licence-tracking-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-105-swms-crew-tracking.sql`

**Interfaces:**
- Produces: RLS on `public.project_members`; tables `public.project_swms_documents`,
  `public.project_swms_acknowledgments`; storage bucket `project-swms` + policies; storage
  policies on the existing `employee-docs` bucket.

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 105: SWMS + Crew Tracking
-- Wires up the existing-but-unused project_members table (project_documents'
-- RLS already references it) and adds SWMS (Safe Work Method Statement)
-- document tracking with per-crew-member acknowledgment. Gated in the UI by
-- the `supportsSwms` workspace-profile flag (trades_field_services,
-- builder_construction). Also adds storage RLS for the existing-but-empty
-- employee-docs bucket (certifications document upload). Run via Supabase
-- MCP apply_migration (name: swms_crew_tracking)
-- ============================================================

alter table public.project_members enable row level security;

create policy "Crew members can view their project's crew"
  on public.project_members for select
  using (
    exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_members.project_id and pm2.user_id = auth.uid()
    )
  );

create policy "Project owners can manage their own project's crew"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id and p.owner_id = auth.uid()
    )
  );

create policy "Org admins/managers can manage project crew"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_members.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create table public.project_swms_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects on delete cascade,
  name          text not null,
  storage_path  text not null,
  uploaded_by   uuid not null references auth.users,
  created_at    timestamptz not null default now()
);

alter table public.project_swms_documents enable row level security;

create policy "Crew and managers can view SWMS documents"
  on public.project_swms_documents for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_swms_documents.project_id and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      where p.id = project_swms_documents.project_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_swms_documents.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Managers can manage SWMS documents"
  on public.project_swms_documents for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_swms_documents.project_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_swms_documents.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create index project_swms_documents_project on public.project_swms_documents (project_id);

create table public.project_swms_acknowledgments (
  id                 uuid primary key default gen_random_uuid(),
  swms_document_id   uuid not null references public.project_swms_documents on delete cascade,
  user_id            uuid not null references auth.users,
  acknowledged_at    timestamptz not null default now(),
  unique (swms_document_id, user_id)
);

alter table public.project_swms_acknowledgments enable row level security;

create policy "Crew and managers can view acknowledgments"
  on public.project_swms_acknowledgments for select
  using (
    exists (
      select 1 from public.project_swms_documents d
      join public.project_members pm on pm.project_id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.project_swms_documents d
      join public.projects p on p.id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.project_swms_documents d
      join public.projects p on p.id = d.project_id
      join public.organisation_members om on om.org_id = p.org_id
      where d.id = project_swms_acknowledgments.swms_document_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Crew members can acknowledge for themselves"
  on public.project_swms_acknowledgments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.project_swms_documents d
      join public.project_members pm on pm.project_id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
    )
  );

create index project_swms_acks_document on public.project_swms_acknowledgments (swms_document_id);

insert into storage.buckets (id, name, public)
  values ('project-swms', 'project-swms', false)
  on conflict (id) do nothing;

create policy "Managers can upload SWMS documents"
  on storage.objects for insert
  with check (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Crew and managers can view SWMS objects"
  on storage.objects for select
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Managers can delete SWMS objects"
  on storage.objects for delete
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Org members can view employee documents"
  on storage.objects for select
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
    )
  );

create policy "Managers can upload employee documents"
  on storage.objects for insert
  with check (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.organisation_members om
      where om.org_id::text = (storage.foldername(name))[1]
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "Managers can delete employee documents"
  on storage.objects for delete
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `project_id: sdwwlnnsijcadkdwsvud`, `name:
swms_crew_tracking`, and the SQL above.

- [ ] **Step 3: Sanity-check queries**

```sql
select tablename, policyname from pg_policies where tablename in ('project_members', 'project_swms_documents', 'project_swms_acknowledgments') order by tablename, policyname;
select id, public from storage.buckets where id = 'project-swms';
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%SWMS%' or policyname ilike '%employee document%';
```
Expected: 3 policies on `project_members`; 2 each on the two new tables; `project-swms` bucket
exists with `public = false`; 3 SWMS object policies + 3 employee-docs object policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-105-swms-crew-tracking.sql
git commit -m "handover: C-1 project_members RLS + SWMS tables/bucket + employee-docs bucket RLS"
```

---

### Task 2: Types

**Files:**
- Create: `src/types/project-crew.ts`
- Create: `src/types/swms.ts`

**Interfaces:**
- Produces: `CrewMemberOption`, `SwmsDocument`, `SwmsAcknowledgment` types, consumed by Tasks 4–6.

- [ ] **Step 1: Create the crew type**

`src/types/project-crew.ts`:
```typescript
export type CrewMemberOption = { userId: string; displayName: string }
```

- [ ] **Step 2: Create the SWMS types**

`src/types/swms.ts`:
```typescript
export type SwmsAcknowledgment = { userId: string; acknowledgedAt: string }
export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  acknowledgments: SwmsAcknowledgment[]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/project-crew.ts src/types/swms.ts
git commit -m "handover: C-2 crew and SWMS types"
```

---

### Task 3: Workspace profile flag

**Files:**
- Modify: `src/lib/workspace-profiles/types.ts`
- Modify: `src/lib/workspace-profiles/registry.ts`

**Interfaces:**
- Produces: `WorkspaceProfileConfig.supportsSwms?: boolean`, `true` for exactly
  `trades_field_services` and `builder_construction`. Consumed by Task 6 (project page gating).

- [ ] **Step 1: Add the field to the type**

In `src/lib/workspace-profiles/types.ts`, the `WorkspaceProfileConfig` type currently reads:
```typescript
export type WorkspaceProfileConfig = {
  key: WorkspaceProfileKey
  label: string
  terminology: Terminology
  navOverrides?: NavOverrides
  supportsMultiSite?: boolean
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
  supportsSwms?: boolean
}
```

- [ ] **Step 2: Set it true for the two gated profiles**

In `src/lib/workspace-profiles/registry.ts`, these two lines currently read:
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
```
Change to:
```typescript
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
```
Do not touch any other profile entries.

- [ ] **Step 3: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "handover: C-3 supportsSwms workspace profile flag"`

---

### Task 4: ProjectCrewPanel component

**Files:**
- Create: `src/components/projects/ProjectCrewPanel.tsx`

**Interfaces:**
- Consumes: `CrewMemberOption` (Task 2), `project_members` table (Task 1).
- Produces: `<ProjectCrewPanel projectId crew availableMembers canManage>`, consumed by Task 6.

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { CrewMemberOption } from '@/types/project-crew'

export default function ProjectCrewPanel({
  projectId,
  crew,
  availableMembers,
  canManage,
}: {
  projectId: string
  crew: CrewMemberOption[]
  availableMembers: CrewMemberOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const [addingId, setAddingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addMember() {
    if (!addingId) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('project_members').insert({
      project_id: projectId,
      user_id: addingId,
    })
    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    setAddingId('')
    router.refresh()
  }

  async function removeMember(userId: string) {
    const supabase = createClient()
    await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Crew</h2>
      {crew.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">No crew added yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {crew.map(member => (
            <li key={member.userId} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{member.displayName}</p>
              {canManage && (
                <button onClick={() => removeMember(member.userId)} className="text-xs font-semibold text-gray-400 transition-colors hover:text-red-500">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && availableMembers.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <select
            value={addingId}
            onChange={e => setAddingId(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Add to crew…</option>
            {availableMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
          <button
            onClick={addMember}
            disabled={!addingId || saving}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/projects/ProjectCrewPanel.tsx && git commit -m "handover: C-4 ProjectCrewPanel component"`

---

### Task 5: ProjectSwmsPanel component

**Files:**
- Create: `src/components/projects/ProjectSwmsPanel.tsx`

**Interfaces:**
- Consumes: `SwmsDocument` (Task 2), `project-swms` bucket + tables (Task 1).
- Produces: `<ProjectSwmsPanel projectId documents crewSize currentUserId isCrewMember canManage>`,
  consumed by Task 6.

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { SwmsDocument } from '@/types/swms'

export default function ProjectSwmsPanel({
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
}: {
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SwmsDocument | null>(null)
  const [ackingId, setAckingId] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const path = `${projectId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, file)
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { error: insertError } = await supabase.from('project_swms_documents').insert({
      project_id: projectId,
      name: file.name,
      storage_path: path,
      uploaded_by: user.id,
    })
    setUploading(false)
    e.target.value = ''
    if (insertError) { setError(insertError.message); return }
    router.refresh()
  }

  async function handleView(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('project-swms').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleAcknowledge(documentId: string) {
    setAckingId(documentId)
    const supabase = createClient()
    await supabase.from('project_swms_acknowledgments').insert({
      swms_document_id: documentId,
      user_id: currentUserId,
    })
    setAckingId(null)
    router.refresh()
  }

  async function handleDelete(doc: SwmsDocument) {
    const supabase = createClient()
    await supabase.storage.from('project-swms').remove([doc.storagePath])
    await supabase.from('project_swms_documents').delete().eq('id', doc.id)
    setPendingDelete(null)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety (SWMS)
        </h2>
        {canManage && (
          <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading ? 'Uploading…' : '+ Upload SWMS'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {documents.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">No SWMS documents added yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {documents.map(doc => {
            const hasAcknowledged = doc.acknowledgments.some(a => a.userId === currentUserId)
            return (
              <li key={doc.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.name}</p>
                    {canManage && (
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.acknowledgments.length} of {crewSize} crew acknowledged
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => handleView(doc.storagePath)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
                    {isCrewMember && !hasAcknowledged && (
                      <button
                        onClick={() => handleAcknowledge(doc.id)}
                        disabled={ackingId === doc.id}
                        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                      >
                        {ackingId === doc.id ? 'Saving…' : "I've read and understood this"}
                      </button>
                    )}
                    {isCrewMember && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
                    {canManage && (
                      <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete SWMS document"
        message={`"${pendingDelete?.name}" will be permanently deleted and crew will lose access to it.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/projects/ProjectSwmsPanel.tsx && git commit -m "handover: C-5 ProjectSwmsPanel component"`

---

### Task 6: Wire Crew + SWMS into the project detail page

**Files:**
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `ProjectCrewPanel` (Task 4), `ProjectSwmsPanel` (Task 5), `supportsSwms` (Task 3).

- [ ] **Step 1: Add imports**

The imports currently read:
```typescript
// src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ProjectTaskGrid from '@/components/projects/ProjectTaskGrid'
import ProjectExpensesPanel, { type ProjectExpense } from '@/components/projects/ProjectExpensesPanel'
import DocumentPanel from '@/components/projects/DocumentPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'
import DeleteProjectButton from '@/components/projects/DeleteProjectButton'
```
Change to:
```typescript
// src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import ProjectTaskGrid from '@/components/projects/ProjectTaskGrid'
import ProjectExpensesPanel, { type ProjectExpense } from '@/components/projects/ProjectExpensesPanel'
import DocumentPanel from '@/components/projects/DocumentPanel'
import ProjectCrewPanel from '@/components/projects/ProjectCrewPanel'
import ProjectSwmsPanel from '@/components/projects/ProjectSwmsPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'
import DeleteProjectButton from '@/components/projects/DeleteProjectButton'
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsDocument } from '@/types/swms'
```

- [ ] **Step 2: Resolve the workspace profile and fetch crew/SWMS data**

The `const [{ data: project }, ...] = await Promise.all([...])` block currently reads:
```typescript
  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }, { data: expenses }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
    supabase.from('project_expenses').select('id, description, amount, expense_date, category, created_by').eq('project_id', projectId).order('expense_date', { ascending: false }),
  ])
  if (!project) notFound()

  const orgId = membership?.org_id ?? null
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(id, email, full_name)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedOrgMembers = orgId && orgMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembers as any[]).map((m: any) => ({
        userId: m.user_id as string,
        displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string,
      }))
    : undefined
```
Change to:
```typescript
  const { supportsSwms } = await getWorkspaceProfileForUser(supabase, user.id)

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }, { data: expenses }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
    supabase.from('project_expenses').select('id, description, amount, expense_date, category, created_by').eq('project_id', projectId).order('expense_date', { ascending: false }),
  ])
  if (!project) notFound()

  const orgId = membership?.org_id ?? null
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(id, email, full_name)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedOrgMembers = orgId && orgMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembers as any[]).map((m: any) => ({
        userId: m.user_id as string,
        displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string,
      }))
    : undefined

  let crew: CrewMemberOption[] = []
  let availableMembers: CrewMemberOption[] = []
  let swmsDocuments: SwmsDocument[] = []
  let isCrewMember = false

  if (supportsSwms) {
    const allOrgMembers = mappedOrgMembers ?? []
    const { data: crewRows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const crewUserIds = new Set((crewRows ?? []).map(r => r.user_id as string))
    crew = allOrgMembers.filter(m => crewUserIds.has(m.userId))
    availableMembers = allOrgMembers.filter(m => !crewUserIds.has(m.userId))
    isCrewMember = crewUserIds.has(user.id)

    const { data: swmsRows } = await supabase
      .from('project_swms_documents')
      .select('id, name, storage_path')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    const swmsIds = (swmsRows ?? []).map(d => d.id)
    const { data: ackRows } = swmsIds.length > 0
      ? await supabase.from('project_swms_acknowledgments').select('swms_document_id, user_id, acknowledged_at').in('swms_document_id', swmsIds)
      : { data: [] as { swms_document_id: string; user_id: string; acknowledged_at: string }[] }

    swmsDocuments = (swmsRows ?? []).map(doc => ({
      id: doc.id,
      name: doc.name,
      storagePath: doc.storage_path,
      acknowledgments: (ackRows ?? [])
        .filter(a => a.swms_document_id === doc.id)
        .map(a => ({ userId: a.user_id, acknowledgedAt: a.acknowledged_at })),
    }))
  }
```

- [ ] **Step 3: Render the two new sections**

The `<DocumentPanel .../>` call currently reads (this is the final element in the returned JSX):
```typescript
        <DocumentPanel
          projectId={project.id}
          userId={user.id}
          initialDocuments={documents ?? []}
          isOrgProject={isOrgProject}
          canManageConfidential={canManageConfidential}
        />
      </div>
    </div>
  )
}
```
Change to add the two new sections after it:
```typescript
        <DocumentPanel
          projectId={project.id}
          userId={user.id}
          initialDocuments={documents ?? []}
          isOrgProject={isOrgProject}
          canManageConfidential={canManageConfidential}
        />

        {supportsSwms && (
          <>
            <ProjectCrewPanel
              projectId={project.id}
              crew={crew}
              availableMembers={availableMembers}
              canManage={canManageConfidential}
            />
            <ProjectSwmsPanel
              projectId={project.id}
              documents={swmsDocuments}
              crewSize={crew.length}
              currentUserId={user.id}
              isCrewMember={isCrewMember}
              canManage={canManageConfidential}
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades/construction-profile org, add a crew member to a project, upload a SWMS
  document, confirm the crew member can view and acknowledge it, confirm a non-crew org member
  cannot see the Crew/Safety sections' data (RLS). As a tutoring-profile org, confirm neither
  section renders at all.
- [ ] Commit: `git add "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" && git commit -m "handover: C-6 wire Crew and SWMS sections into the project detail page"`

---

### Task 7: Certification document upload

**Files:**
- Modify: `src/components/team/EmployeeDrawer.tsx`

**Interfaces:**
- Consumes: `employee-docs` bucket RLS (Task 1). The `/api/team/certifications` route already
  accepts and stores `document_path` — no backend change needed, this is frontend-only.

- [ ] **Step 1: Add the storage import and extend the Cert type**

The imports currently read:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import ScrollFade from '@/components/ui/ScrollFade'

type Profile = { job_title: string | null; start_date: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }
type Cert = { id: string; name: string; issued_date: string | null; expiry_date: string | null }
```
Change to:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ScrollFade from '@/components/ui/ScrollFade'

type Profile = { job_title: string | null; start_date: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }
type Cert = { id: string; name: string; issued_date: string | null; expiry_date: string | null; document_path: string | null }
```

- [ ] **Step 2: Add file state**

The line `const [addingCert, setAddingCert] = useState(false)` currently reads exactly that. Add a
sibling right after it:
```typescript
  const [addingCert, setAddingCert] = useState(false)
  const [newCertFile, setNewCertFile] = useState<File | null>(null)
```

- [ ] **Step 3: Update `addCert` to upload the file first**

`addCert` currently reads:
```typescript
  async function addCert() {
    if (!newCertName) return
    setAddingCert(true)
    const res = await fetch('/api/team/certifications', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, name: newCertName, expiry_date: newCertExpiry || null }) })
    const newCert = await res.json()
    setCerts(prev => [...prev, newCert])
    setNewCertName(''); setNewCertExpiry(''); setAddingCert(false)
  }
```
Change to:
```typescript
  async function addCert() {
    if (!newCertName) return
    setAddingCert(true)

    let documentPath: string | null = null
    if (newCertFile) {
      const supabase = createClient()
      const path = `${orgId}/${member.user_id}/${Date.now()}-${newCertFile.name}`
      const { error: uploadError } = await supabase.storage.from('employee-docs').upload(path, newCertFile)
      if (!uploadError) documentPath = path
    }

    const res = await fetch('/api/team/certifications', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, name: newCertName, expiry_date: newCertExpiry || null, document_path: documentPath }) })
    const newCert = await res.json()
    setCerts(prev => [...prev, newCert])
    setNewCertName(''); setNewCertExpiry(''); setNewCertFile(null); setAddingCert(false)
  }
```

- [ ] **Step 4: Add a view-document handler**

Add a new function right after `deleteCert`, which currently reads:
```typescript
  async function deleteCert(id: string) {
    await fetch('/api/team/certifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setCerts(prev => prev.filter(c => c.id !== id))
  }
```
Change to add a sibling function:
```typescript
  async function deleteCert(id: string) {
    await fetch('/api/team/certifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setCerts(prev => prev.filter(c => c.id !== id))
  }

  async function viewCertDocument(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
```

- [ ] **Step 5: Add a View link per certification and a file input to the add form**

The certifications list row currently reads:
```typescript
                <div key={c.id} className="flex items-start justify-between rounded-xl border border-gray-100 dark:border-slate-800 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{c.name}</p>
                    {c.expiry_date && (
                      <p className={`text-xs mt-0.5 ${expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-gray-400'}`}>
                        Expires {c.expiry_date}{expired ? ' — EXPIRED' : expiringSoon ? ' — expiring soon' : ''}
                      </p>
                    )}
                  </div>
                  {canManageTeam && <button onClick={() => deleteCert(c.id)} className="text-gray-300 hover:text-red-400 ml-2 text-lg leading-none">×</button>}
                </div>
```
Change to:
```typescript
                <div key={c.id} className="flex items-start justify-between rounded-xl border border-gray-100 dark:border-slate-800 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{c.name}</p>
                    {c.expiry_date && (
                      <p className={`text-xs mt-0.5 ${expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-gray-400'}`}>
                        Expires {c.expiry_date}{expired ? ' — EXPIRED' : expiringSoon ? ' — expiring soon' : ''}
                      </p>
                    )}
                    {c.document_path && (
                      <button onClick={() => viewCertDocument(c.document_path as string)} className="mt-0.5 text-xs font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">View document</button>
                    )}
                  </div>
                  {canManageTeam && <button onClick={() => deleteCert(c.id)} className="text-gray-300 hover:text-red-400 ml-2 text-lg leading-none">×</button>}
                </div>
```

The add-certification form currently reads:
```typescript
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3 space-y-2">
                <input value={newCertName} onChange={e => setNewCertName(e.target.value)} placeholder="Certification name"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="date" value={newCertExpiry} onChange={e => setNewCertExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <button onClick={addCert} disabled={addingCert || !newCertName}
                  className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2 text-sm font-semibold disabled:opacity-50">
                  {addingCert ? 'Adding…' : 'Add certification'}
                </button>
              </div>
```
Change to add a file input between the date input and the submit button:
```typescript
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3 space-y-2">
                <input value={newCertName} onChange={e => setNewCertName(e.target.value)} placeholder="Certification name"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="date" value={newCertExpiry} onChange={e => setNewCertExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="file" onChange={e => setNewCertFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-gray-500 dark:text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 dark:file:bg-slate-700 dark:file:text-slate-200" />
                <button onClick={addCert} disabled={addingCert || !newCertName}
                  className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2 text-sm font-semibold disabled:opacity-50">
                  {addingCert ? 'Adding…' : 'Add certification'}
                </button>
              </div>
```

- [ ] **Step 6: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: add a certification with a file attached; confirm "View document" opens it via a
  signed URL; confirm existing certifications without a document still display correctly (no
  "View document" link).
- [ ] Commit: `git add src/components/team/EmployeeDrawer.tsx && git commit -m "handover: C-7 certification document upload"`

---

### Task 8: Dashboard certifications-due card

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Produces: a new `certsDue` section in the Dashboard's "Today" feed, following the exact pattern
  `vehiclesDue` already uses.

- [ ] **Step 1: Add the type and prop to DashboardUpcoming**

The type exports currently include:
```typescript
export type UpcomingVehicleDue = {
  id: string
  registration_number: string
  kind: 'rego' | 'service'
  daysUntilDue: number
}
export type UpcomingIncidentReport = {
  id: string
  type: 'injury' | 'near_miss' | 'hazard'
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  occurred_at: string
}
```
Add a new type between them:
```typescript
export type UpcomingVehicleDue = {
  id: string
  registration_number: string
  kind: 'rego' | 'service'
  daysUntilDue: number
}
export type UpcomingCertDue = {
  id: string
  name: string
  displayName: string
  daysUntilDue: number
}
export type UpcomingIncidentReport = {
  id: string
  type: 'injury' | 'near_miss' | 'hazard'
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  occurred_at: string
}
```

Also add the icon import. The lucide-react import line currently reads:
```typescript
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench, ShieldAlert } from 'lucide-react'
```
Change to:
```typescript
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench, ShieldAlert, Award } from 'lucide-react'
```

The component's props signature currently reads:
```typescript
export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
  approvals,
  unreadMessages,
  dueExpenses,
  dueBusinessExpenses,
  vehiclesDue,
  incidentReportsDue,
  currentUserId,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
  dueExpenses: UpcomingDueExpense[]
  dueBusinessExpenses: UpcomingDueExpense[]
  vehiclesDue: UpcomingVehicleDue[]
  incidentReportsDue: UpcomingIncidentReport[]
  currentUserId: string
}) {
```
Change to:
```typescript
export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
  approvals,
  unreadMessages,
  dueExpenses,
  dueBusinessExpenses,
  vehiclesDue,
  certsDue,
  incidentReportsDue,
  currentUserId,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
  dueExpenses: UpcomingDueExpense[]
  dueBusinessExpenses: UpcomingDueExpense[]
  vehiclesDue: UpcomingVehicleDue[]
  certsDue: UpcomingCertDue[]
  incidentReportsDue: UpcomingIncidentReport[]
  currentUserId: string
}) {
```

- [ ] **Step 2: Update the empty-state check and the two isLast chains that reference `vehiclesDue.length`**

The empty-state check currently reads:
```typescript
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && incidentReportsDue.length === 0) return null
```
Change to:
```typescript
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && certsDue.length === 0 && incidentReportsDue.length === 0) return null
```

The `visibleDueExpenses.map` block's `isLast` line currently reads:
```typescript
          const isLast = i === visibleDueExpenses.length - 1 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```
Change to:
```typescript
          const isLast = i === visibleDueExpenses.length - 1 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && certsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```

The `visibleDueBusinessExpenses.map` block's `isLast` line currently reads:
```typescript
          const isLast = i === visibleDueBusinessExpenses.length - 1 && vehiclesDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```
Change to:
```typescript
          const isLast = i === visibleDueBusinessExpenses.length - 1 && vehiclesDue.length === 0 && certsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```

- [ ] **Step 3: Update vehiclesDue's own isLast and add the certsDue render block**

The `vehiclesDue.map` block currently reads:
```typescript
        {vehiclesDue.map((item, i) => {
          const dueLabel = item.daysUntilDue <= 0 ? 'Overdue' : `Due in ${item.daysUntilDue}d`
          const urgency = item.daysUntilDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === vehiclesDue.length - 1 && incidentReportsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`vehicle-${item.kind}-${item.id}`}
              href={`/dashboard/vehicles/${item.id}`}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                {item.kind === 'rego' ? <Car size={15} /> : <Wrench size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {item.registration_number} — {item.kind === 'rego' ? 'Registration renewal' : 'Service due'}
                </p>
                <p className={`text-xs font-bold ${urgency}`}>{dueLabel}</p>
              </div>
            </Link>
          )
        })}
        {incidentReportsDue.map((report, i) => {
```
Change to:
```typescript
        {vehiclesDue.map((item, i) => {
          const dueLabel = item.daysUntilDue <= 0 ? 'Overdue' : `Due in ${item.daysUntilDue}d`
          const urgency = item.daysUntilDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === vehiclesDue.length - 1 && certsDue.length === 0 && incidentReportsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`vehicle-${item.kind}-${item.id}`}
              href={`/dashboard/vehicles/${item.id}`}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                {item.kind === 'rego' ? <Car size={15} /> : <Wrench size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {item.registration_number} — {item.kind === 'rego' ? 'Registration renewal' : 'Service due'}
                </p>
                <p className={`text-xs font-bold ${urgency}`}>{dueLabel}</p>
              </div>
            </Link>
          )
        })}
        {certsDue.map((item, i) => {
          const dueLabel = item.daysUntilDue <= 0 ? 'Overdue' : `Due in ${item.daysUntilDue}d`
          const urgency = item.daysUntilDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === certsDue.length - 1 && incidentReportsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`cert-${item.id}`}
              href="/dashboard/team"
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <Award size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {item.displayName} — {item.name}
                </p>
                <p className={`text-xs font-bold ${urgency}`}>{dueLabel}</p>
              </div>
            </Link>
          )
        })}
        {incidentReportsDue.map((report, i) => {
```

- [ ] **Step 4: Fetch and compute certsDue in the dashboard page**

The `Promise.all` array destructure currently reads:
```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes, dueExpensesRes, dueBusinessExpensesRes, vehiclesRes, incidentReportsRes] = await Promise.all([
```
Change to add `certsRes`:
```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes, dueExpensesRes, dueBusinessExpensesRes, vehiclesRes, incidentReportsRes, certsRes] = await Promise.all([
```
The array's last two entries currently read:
```typescript
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
    supabase.from('incident_reports').select('id, type, severity, occurred_at').eq('status', 'open').order('occurred_at', { ascending: false }),
  ])
```
Change to add a certifications query, scoped to the current org if in one, else the current user
(matching how other org-optional queries in this same array branch on `orgId`). **Note:**
`certifications.user_id` references `auth.users` directly, not `profiles` — there is no
`certifications_user_id_fkey`-to-`profiles` relationship for Postgrest to embed, unlike
`organisation_members.user_id`. Fetch plain columns only; display names are resolved below from
`mappedMembers`, which this page already computes elsewhere (search the file for
`profiles!organisation_members_user_id_fkey` to confirm it's in scope before this point — it is,
used for the manager task pool further down):
```typescript
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
    supabase.from('incident_reports').select('id, type, severity, occurred_at').eq('status', 'open').order('occurred_at', { ascending: false }),
    orgId
      ? supabase.from('certifications').select('id, user_id, name, expiry_date').eq('org_id', orgId)
      : supabase.from('certifications').select('id, user_id, name, expiry_date').eq('user_id', user.id),
  ])
```

The `incidentReportsDue` computation currently reads:
```typescript
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]
```
Add a `certsDue` computation right after it, resolving each certification's owner name from the
existing `mappedMembers` list (falls back to "You" for a solo Pro with no org, since in that branch
every returned row is necessarily the current user's own certification):
```typescript
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]

  const certThresholdDate = new Date(); certThresholdDate.setDate(certThresholdDate.getDate() + 30)
  const certThresholdStr = certThresholdDate.toISOString().split('T')[0]
  const certsDue: UpcomingCertDue[] = ((certsRes.data ?? []) as {
    id: string
    user_id: string
    name: string
    expiry_date: string | null
  }[])
    .filter(c => c.expiry_date && c.expiry_date <= certThresholdStr)
    .map(c => ({
      id: c.id,
      name: c.name,
      displayName: mappedMembers?.find(m => m.userId === c.user_id)?.displayName ?? 'You',
      daysUntilDue: daysUntil(c.expiry_date as string),
    }))
```

Add `UpcomingCertDue` to the type-only import from `DashboardUpcoming`. The import line currently
reads:
```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingIncidentReport } from '@/components/dashboard/DashboardUpcoming'
```
Change to:
```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingCertDue, UpcomingIncidentReport } from '@/components/dashboard/DashboardUpcoming'
```

Finally, the `<DashboardUpcoming .../>` call currently reads:
```typescript
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```
Change to add the `certsDue` prop:
```typescript
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```

- [ ] **Step 5: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean. If the `profiles!certifications_user_id_fkey` embed
  fails, verify Codex applied the documented fallback and re-run the build.
- [ ] Manual: with a test certification expiring within 30 days, confirm it appears in the
  Dashboard's Today feed linking to `/dashboard/team`; confirm it disappears once nothing is due.
- [ ] Commit: `git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx && git commit -m "handover: C-8 dashboard certifications-due card"`

---

## Verification

- `pnpm run build` must pass clean after every task (this project's only gate — no test runner).
- Full manual smoke, as a trades/construction-profile org (per the design doc):
  1. Add two org members to a project's Crew; confirm a third, non-crew org member cannot see the
     project's Safety section data at all.
  2. Upload a SWMS document as a manager; confirm both crew members can view it and each can
     acknowledge it independently; confirm the manager's view shows "2 of 2 acknowledged."
  3. Confirm nothing in the app blocks any action based on acknowledgment state.
  4. Add a certification with a document attached; confirm it can be viewed back via a signed URL.
  5. Confirm the Dashboard shows a certifications-expiring card when a test certification's expiry
     date is within 30 days, and that it's absent when nothing is expiring.
- Manual smoke, as a tutoring-profile org: confirm no Crew or Safety sections appear on a project at
  all; confirm Certifications and the Dashboard expiry card still work identically (ungated).
