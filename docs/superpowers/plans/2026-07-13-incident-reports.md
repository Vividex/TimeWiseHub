# Incident Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: This project uses the handover
> loop (Claude = conductor, Codex = implementer via `.handover/`), not
> subagent-driven-development or executing-plans. After this plan is written,
> the conductor prepares `.handover/spec.md` (C-N checklist) from the Tasks
> below and invokes the handover-loop skill. Steps use checkbox (`- [ ]`)
> syntax for tracking within each task.

**Goal:** Let owner/admin/manager roles file, review, close, and permanently
retain workplace safety incident reports (injury / near-miss / hazard), with
crew-scoped visibility, optional photo attachments, a print view, and a
Dashboard "Today" surface for open reports.

**Architecture:** One new table (`incident_reports`) plus a photos table
(`incident_report_photos`), both RLS-gated by a new
`can_access_incident_report()` SQL function that mirrors the existing
`can_access_vehicle()` crew-scoping pattern. Server components fetch and pass
data to client components for the list/detail views, exactly like
`src/app/dashboard/vehicles/`. A dedicated print route reuses the
`isInvoicePrint`-style shell-bypass already in `DashboardShell.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind
v4, Supabase (Postgres + RLS + Storage), pnpm. No new npm dependencies.

## Global Constraints

- No industry gating — every Team-plan org gets this feature (same rule as
  Vehicle Tracking: `isTeamPlan(subscription)` gates it, `workspace_profile`
  does not).
- Filing/editing/closing is owner/admin/manager only. Employees get read-only
  access to reports where they're the `employee_id` or in `witness_ids`, never
  a create/edit/close path.
- No DELETE capability anywhere in this feature — no RLS delete policy on
  either table, no delete button in any UI. This is deliberate, not an
  oversight (see spec's "Explicitly out of scope").
- Once `status = 'closed'`, a report is immutable — no RLS UPDATE policy
  matches a closed row, including from the owner.
- No new PDF-generation dependency — printing is a plain print-styled route,
  identical in kind to `/dashboard/invoices/[id]/print`.
- No push/email notification on filing.
- Source spec: `docs/superpowers/specs/2026-07-13-incident-reports-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-101-incident-reports.sql`

**Interfaces:**
- Produces: tables `incident_reports`, `incident_report_photos`; function
  `can_access_incident_report(p_org_id uuid, p_employee_id uuid, p_witness_ids uuid[]) returns boolean`;
  storage bucket `incident-photos`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 101: Incident reports
-- Workplace safety incident reports (injury / near-miss / hazard).
-- Filed by owner/admin/manager only. Permanent once closed — no UPDATE
-- policy matches a closed row, and there is no DELETE policy at all on
-- either table. This is a deliberate compliance-record design, not an
-- oversight (see docs/superpowers/specs/2026-07-13-incident-reports-design.md).
--
-- Visibility (via can_access_incident_report()):
--   - owner/admin: always, org-wide.
--   - manager: reports where the employee is unassigned to any crew, in no
--     crew, or in a crew THIS manager runs — same crew-scoping shape as
--     can_access_vehicle().
--   - anyone: if they are the report's employee_id, or listed in
--     witness_ids (read-only either way — the RLS UPDATE policy separately
--     requires owner/admin/manager, so this alone never grants write access).
-- Run via Supabase MCP apply_migration (name: incident_reports)
-- ============================================================

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('injury', 'near_miss', 'hazard')),
  severity text not null check (severity in ('minor', 'moderate', 'serious', 'critical')),
  occurred_at timestamptz not null,
  location text,
  description text not null,
  employee_id uuid references auth.users(id) on delete set null,
  witness_ids uuid[] not null default '{}',
  body_part text,
  first_aid_given boolean,
  medical_treatment_required boolean,
  time_off_work boolean,
  root_cause text,
  corrective_action text,
  status text not null default 'open' check (status in ('open', 'closed')),
  filed_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index incident_reports_org_id_idx on public.incident_reports(org_id);
create index incident_reports_employee_id_idx on public.incident_reports(employee_id);

create table public.incident_report_photos (
  id uuid primary key default gen_random_uuid(),
  incident_report_id uuid not null references public.incident_reports(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index incident_report_photos_report_id_idx on public.incident_report_photos(incident_report_id);

alter table public.incident_reports enable row level security;
alter table public.incident_report_photos enable row level security;

create or replace function public.can_access_incident_report(
  p_org_id uuid,
  p_employee_id uuid,
  p_witness_ids uuid[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from organisation_members om
      where om.org_id = p_org_id and om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or (
          om.role = 'manager'
          and (
            p_employee_id is null
            or not exists (select 1 from crew_members cm where cm.user_id = p_employee_id)
            or exists (
              select 1 from crew_members cm
              join crews c on c.id = cm.crew_id
              where cm.user_id = p_employee_id and c.manager_id = auth.uid()
            )
          )
        )
      )
    )
    or p_employee_id = auth.uid()
    or auth.uid() = any(p_witness_ids);
$$;

create policy "Users can view accessible incident reports"
  on public.incident_reports for select
  using (can_access_incident_report(org_id, employee_id, witness_ids));

create policy "Managers+ can file incident reports"
  on public.incident_reports for insert
  with check (
    filed_by = auth.uid()
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
  );

-- USING sees the OLD row: only an open report can be the target of an update
-- at all, which is what makes "closed = locked" hold even for the owner.
-- WITH CHECK sees the NEW row: if the write is closing the report (setting
-- status = 'closed'), reviewed_by must be the person doing it — you cannot
-- attribute a close action to someone else.
create policy "Managers+ can update open incident reports they can access"
  on public.incident_reports for update
  using (
    status = 'open'
    and can_access_incident_report(org_id, employee_id, witness_ids)
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    can_access_incident_report(org_id, employee_id, witness_ids)
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and (status = 'open' or reviewed_by = auth.uid())
  );

-- No delete policy on incident_reports at all — RLS default-denies DELETE
-- when a table has RLS enabled and no matching policy. This is intentional.

create policy "Users can view photos for accessible incident reports"
  on public.incident_report_photos for select
  using (
    exists (
      select 1 from incident_reports ir
      where ir.id = incident_report_photos.incident_report_id
      and can_access_incident_report(ir.org_id, ir.employee_id, ir.witness_ids)
    )
  );

create policy "Managers+ can add photos to open incident reports"
  on public.incident_report_photos for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from incident_reports ir
      join organisation_members om on om.org_id = ir.org_id and om.user_id = auth.uid()
      where ir.id = incident_report_photos.incident_report_id
      and ir.status = 'open'
      and om.role in ('owner', 'admin', 'manager')
    )
  );

-- No delete/update policy on incident_report_photos either — append-only,
-- same shape as vehicle_notes.

insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', false)
on conflict (id) do nothing;

-- Storage path convention: {incident_report_id}/{filename} — mirrors the
-- existing path-based storage RLS pattern used for worksheet-stickers.
create policy "Users can view incident photos for accessible reports"
  on storage.objects for select
  using (
    bucket_id = 'incident-photos'
    and exists (
      select 1 from incident_reports ir
      where ir.id::text = (storage.foldername(name))[1]
      and can_access_incident_report(ir.org_id, ir.employee_id, ir.witness_ids)
    )
  );

create policy "Managers+ can upload incident photos"
  on storage.objects for insert
  with check (
    bucket_id = 'incident-photos'
    and exists (
      select 1 from incident_reports ir
      join organisation_members om on om.org_id = ir.org_id and om.user_id = auth.uid()
      where ir.id::text = (storage.foldername(name))[1]
      and ir.status = 'open'
      and om.role in ('owner', 'admin', 'manager')
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply via Supabase MCP `apply_migration` (name: `incident_reports`).

- [ ] **Step 3: Verify**

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('incident_reports', 'incident_report_photos');

select id from storage.buckets where id = 'incident-photos';
```
Expected: both table names returned, one bucket row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-101-incident-reports.sql
git commit -m "handover: C-1 incident reports schema + RLS + photo storage"
```

---

### Task 2: Types

**Files:**
- Create: `src/types/incident-reports.ts`

**Interfaces:**
- Produces: `IncidentReport`, `IncidentReportPhoto` types, exported for every
  later task to import.

Note: the sidebar nav entry is deliberately **not** added in this task — it's
bundled into Task 3 instead, alongside the list page it points to. Landing a
nav link before its destination page exists leaves a live 404 in production
between two separate handover pushes; this exact ordering mistake bit an
earlier phase in this project (see `.handover/decisions.md`'s Vehicle
Tracking v1 notes on why its nav change was bundled with its page change).

- [ ] **Step 1: Create `src/types/incident-reports.ts`**

```ts
export type IncidentType = 'injury' | 'near_miss' | 'hazard'
export type IncidentSeverity = 'minor' | 'moderate' | 'serious' | 'critical'
export type IncidentStatus = 'open' | 'closed'

export type IncidentReport = {
  id: string
  org_id: string
  type: IncidentType
  severity: IncidentSeverity
  occurred_at: string
  location: string | null
  description: string
  employee_id: string | null
  witness_ids: string[]
  body_part: string | null
  first_aid_given: boolean | null
  medical_treatment_required: boolean | null
  time_off_work: boolean | null
  root_cause: string | null
  corrective_action: string | null
  status: IncidentStatus
  filed_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

export type IncidentReportPhoto = {
  id: string
  incident_report_id: string
  storage_path: string
  uploaded_by: string
  created_at: string
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 3: Commit**

```bash
git add src/types/incident-reports.ts
git commit -m "handover: C-2 incident report types"
```

---

### Task 3: List page + new-report form + nav entry

**Files:**
- Create: `src/app/dashboard/incident-reports/page.tsx`
- Create: `src/components/incident-reports/IncidentReportsView.tsx`
- Create: `src/lib/incident-reports.ts`
- Modify: `src/components/nav/SidebarNav.tsx`

**Interfaces:**
- Consumes: `IncidentReport`, `IncidentType`, `IncidentSeverity` from Task 2.
- Produces: `IncidentReportsView` component; `OrgMemberOption` type (mirrors
  the one already defined per-vehicle-file, but this feature keeps its own
  copy since it's a distinct file with no import relationship to
  `src/components/vehicles/`); `TYPE_LABEL`, `SEVERITY_LABEL`,
  `SEVERITY_COLOUR`, `STATUS_COLOUR` maps in `src/lib/incident-reports.ts` for
  later tasks (list badges and detail page) to both import and stay in sync.

Nav and the list page land in this same task so the sidebar link and its
destination page ship atomically — see Task 2's note on why.

- [ ] **Step 1: Create `src/lib/incident-reports.ts`**

```ts
import type { IncidentSeverity, IncidentStatus, IncidentType } from '@/types/incident-reports'

export const TYPE_LABEL: Record<IncidentType, string> = {
  injury: 'Injury',
  near_miss: 'Near miss',
  hazard: 'Hazard',
}

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
  critical: 'Critical',
}

export const SEVERITY_COLOUR: Record<IncidentSeverity, string> = {
  minor: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  serious: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  closed: 'Closed',
}

export const STATUS_COLOUR: Record<IncidentStatus, string> = {
  open: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  closed: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
}
```

- [ ] **Step 2: Create `src/app/dashboard/incident-reports/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import IncidentReportsView, { type OrgMemberOption } from '@/components/incident-reports/IncidentReportsView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { IncidentReport } from '@/types/incident-reports'

export default async function IncidentReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membership }, subscription] = await Promise.all([
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const orgId = membership?.org_id ?? null
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const canSeeIncidentReports = Boolean(orgId && isTeamPlan(subscription))

  if (!canSeeIncidentReports || !orgId) redirect('/dashboard')

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

  const reportList = (reports ?? []) as IncidentReport[]
  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl">
        <IncidentReportsView reports={reportList} orgId={orgId} members={memberOptions} canManage={isManager} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/incident-reports/IncidentReportsView.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
import { TYPE_LABEL, SEVERITY_LABEL, SEVERITY_COLOUR, STATUS_LABEL, STATUS_COLOUR } from '@/lib/incident-reports'
import type { IncidentReport, IncidentType, IncidentSeverity } from '@/types/incident-reports'

export type OrgMemberOption = { user_id: string; name: string }

const TYPES: IncidentType[] = ['injury', 'near_miss', 'hazard']
const SEVERITIES: IncidentSeverity[] = ['minor', 'moderate', 'serious', 'critical']

function displayDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

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
  const router = useRouter()
  const { query, setQuery, filtered } = useTextFilter(reports, r => r.description)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<IncidentType>('injury')
  const [severity, setSeverity] = useState<IncidentSeverity>('minor')
  const [occurredAt, setOccurredAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [witnessIds, setWitnessIds] = useState<string[]>([])

  function resetForm() {
    setType('injury'); setSeverity('minor'); setOccurredAt(''); setLocation('')
    setDescription(''); setEmployeeId(''); setWitnessIds([]); setError(null)
  }

  function toggleWitness(userId: string) {
    setWitnessIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await createClient().auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }

    const supabase = createClient()
    const { error: insertError } = await supabase.from('incident_reports').insert({
      org_id: orgId,
      type,
      severity,
      occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      location: location.trim() || null,
      description: description.trim(),
      employee_id: employeeId || null,
      witness_ids: witnessIds,
      filed_by: user.id,
    })

    if (insertError) { setError(insertError.message); setSaving(false); return }

    resetForm()
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Incident Reports</h2>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Workplace safety incidents — injuries, near misses, and hazard observations.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setOpen(v => !v)}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            {open ? 'Cancel' : '+ New report'}
          </button>
        )}
      </div>

      {open && canManage && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Type *</label>
              <select required value={type} onChange={e => setType(e.target.value as IncidentType)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Severity *</label>
              <select required value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Date &amp; time *</label>
              <input required type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 14 Marina Pde, Wollongong NSW"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">What happened? *</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Employee involved</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="">None / not applicable</option>
                {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Witnesses</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-slate-700">
                {members.map(member => (
                  <label key={member.user_id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={witnessIds.includes(member.user_id)} onChange={() => toggleWitness(member.user_id)} />
                    {member.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'File report'}
          </button>
        </form>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="Search descriptions..." />

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-gray-500 dark:text-slate-400">No incident reports found.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {filtered.map(report => (
            <Link
              key={report.id}
              href={`/dashboard/incident-reports/${report.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                  <ShieldAlert size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{TYPE_LABEL[report.type]}</p>
                  <p className="truncate text-xs font-semibold text-gray-500 dark:text-slate-400">
                    {displayDateTime(report.occurred_at)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${SEVERITY_COLOUR[report.severity]}`}>
                  {SEVERITY_LABEL[report.severity]}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOUR[report.status]}`}>
                  {STATUS_LABEL[report.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Modify `src/components/nav/SidebarNav.tsx`**

Read the file first. Add `ShieldAlert` to the `lucide-react` import line
(alongside the other icons already imported there), then append an item to
the `'People'` group's items array, after `Crews`:

```tsx
    { label: 'Incident Reports', href: '/dashboard/incident-reports', icon: ShieldAlert },
```

- [ ] **Step 5: Build**

Run: `pnpm run build` — must pass clean; confirm `/dashboard/incident-reports`
appears in the route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/incident-reports/page.tsx src/components/incident-reports/IncidentReportsView.tsx src/lib/incident-reports.ts src/components/nav/SidebarNav.tsx
git commit -m "handover: C-3 incident reports list page + new-report form + nav entry"
```

---

### Task 4: Detail page — view, edit, close, photos

**Files:**
- Create: `src/app/dashboard/incident-reports/[id]/page.tsx`
- Create: `src/components/incident-reports/IncidentReportDetailClient.tsx`

**Interfaces:**
- Consumes: `IncidentReport`, `IncidentReportPhoto` (Task 2); `TYPE_LABEL`,
  `SEVERITY_LABEL`, `SEVERITY_COLOUR`, `STATUS_LABEL`, `STATUS_COLOUR` (Task
  3); `OrgMemberOption` (re-declared locally, same shape as Task 3 — these are
  two separate files with no import relationship, matching how
  `VehiclesView.tsx` and `VehicleDetailClient.tsx` each declare their own copy
  today).
- Produces: nothing further tasks depend on — this is the last UI task before
  print/dashboard integration, which only need the route path
  `/dashboard/incident-reports/${id}`.

- [ ] **Step 1: Create `src/app/dashboard/incident-reports/[id]/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import IncidentReportDetailClient, { type OrgMemberOption } from '@/components/incident-reports/IncidentReportDetailClient'
import type { IncidentReport, IncidentReportPhoto } from '@/types/incident-reports'

export default async function IncidentReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: report } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!report) notFound()

  const currentReport = report as IncidentReport

  const [{ data: photos }, { data: membership }, { data: members }] = await Promise.all([
    supabase
      .from('incident_report_photos')
      .select('*')
      .eq('incident_report_id', currentReport.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('role, org_id')
      .eq('org_id', currentReport.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentReport.org_id),
  ])

  const canManage = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  const photoUrls = await Promise.all(
    ((photos ?? []) as IncidentReportPhoto[]).map(async photo => {
      const { data } = await supabase.storage.from('incident-photos').createSignedUrl(photo.storage_path, 3600)
      return { ...photo, url: data?.signedUrl ?? null }
    })
  )

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-4xl">
        <IncidentReportDetailClient
          report={currentReport}
          photos={photoUrls}
          members={memberOptions}
          userId={user.id}
          canManage={canManage}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/incident-reports/IncidentReportDetailClient.tsx`**

```tsx
'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Camera, CheckCircle2, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { TYPE_LABEL, SEVERITY_LABEL, SEVERITY_COLOUR, STATUS_LABEL, STATUS_COLOUR } from '@/lib/incident-reports'
import type { IncidentReport, IncidentReportPhoto, IncidentSeverity, IncidentType } from '@/types/incident-reports'

export type OrgMemberOption = { user_id: string; name: string }
type PhotoWithUrl = IncidentReportPhoto & { url: string | null }

const TYPES: IncidentType[] = ['injury', 'near_miss', 'hazard']
const SEVERITIES: IncidentSeverity[] = ['minor', 'moderate', 'serious', 'critical']

function displayDateTime(iso: string | null) {
  if (!iso) return 'Not set'
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function IncidentReportDetailClient({
  report: initialReport,
  photos: initialPhotos,
  members,
  userId,
  canManage,
}: {
  report: IncidentReport
  photos: PhotoWithUrl[]
  members: OrgMemberOption[]
  userId: string
  canManage: boolean
}) {
  const router = useRouter()
  const [report, setReport] = useState(initialReport)
  const [photos, setPhotos] = useState(initialPhotos)

  const isOpen = report.status === 'open'
  const canEdit = canManage && isOpen

  const [type, setType] = useState(report.type)
  const [severity, setSeverity] = useState(report.severity)
  const [location, setLocation] = useState(report.location ?? '')
  const [description, setDescription] = useState(report.description)
  const [employeeId, setEmployeeId] = useState(report.employee_id ?? '')
  const [witnessIds, setWitnessIds] = useState<string[]>(report.witness_ids)
  const [bodyPart, setBodyPart] = useState(report.body_part ?? '')
  const [firstAidGiven, setFirstAidGiven] = useState(report.first_aid_given ?? false)
  const [medicalTreatmentRequired, setMedicalTreatmentRequired] = useState(report.medical_treatment_required ?? false)
  const [timeOffWork, setTimeOffWork] = useState(report.time_off_work ?? false)
  const [rootCause, setRootCause] = useState(report.root_cause ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(report.corrective_action ?? '')
  const [savingReport, setSavingReport] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const [resolutionNotes, setResolutionNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  function memberName(id: string | null) {
    if (!id) return 'Unknown'
    if (id === userId) return 'You'
    return members.find(member => member.user_id === id)?.name ?? 'Team member'
  }

  function toggleWitness(id: string) {
    setWitnessIds(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id])
  }

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) return

    setSavingReport(true)
    setReportError(null)

    const updates = {
      type,
      severity,
      location: location.trim() || null,
      description: description.trim(),
      employee_id: employeeId || null,
      witness_ids: witnessIds,
      body_part: type === 'injury' ? (bodyPart.trim() || null) : null,
      first_aid_given: type === 'injury' ? firstAidGiven : null,
      medical_treatment_required: type === 'injury' ? medicalTreatmentRequired : null,
      time_off_work: type === 'injury' ? timeOffWork : null,
      root_cause: rootCause.trim() || null,
      corrective_action: correctiveAction.trim() || null,
    }

    const supabase = createClient()
    const { error } = await supabase.from('incident_reports').update(updates).eq('id', report.id)

    if (error) {
      setReportError(error.message)
      setSavingReport(false)
      return
    }

    setReport(prev => ({ ...prev, ...updates }))
    setSavingReport(false)
    router.refresh()
  }

  async function closeReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || !isOpen) return

    setClosing(true)
    setCloseError(null)

    const updates = {
      status: 'closed' as const,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      resolution_notes: resolutionNotes.trim() || null,
    }

    const supabase = createClient()
    const { error } = await supabase.from('incident_reports').update(updates).eq('id', report.id)

    if (error) {
      setCloseError(error.message)
      setClosing(false)
      return
    }

    setReport(prev => ({ ...prev, ...updates }))
    setClosing(false)
    router.refresh()
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !photoFile) return

    setUploadingPhoto(true)
    setPhotoError(null)

    const supabase = createClient()
    const ext = photoFile.name.split('.').pop()
    const path = `${report.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('incident-photos').upload(path, photoFile)
    if (uploadError) {
      setPhotoError(uploadError.message)
      setUploadingPhoto(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('incident_report_photos')
      .insert({ incident_report_id: report.id, storage_path: path, uploaded_by: userId })
      .select('*')
      .single()

    if (insertError) {
      setPhotoError(insertError.message)
      setUploadingPhoto(false)
      return
    }

    const { data: signed } = await supabase.storage.from('incident-photos').createSignedUrl(path, 3600)
    setPhotos(prev => [{ ...(data as IncidentReportPhoto), url: signed?.signedUrl ?? null }, ...prev])
    setPhotoFile(null)
    setUploadingPhoto(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/incident-reports" className="text-sm font-bold text-cyan-600 hover:underline dark:text-cyan-400">
        Back to incident reports
      </Link>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <ShieldAlert size={18} />
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{TYPE_LABEL[report.type]}</h1>
                <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">{displayDateTime(report.occurred_at)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY_COLOUR[report.severity]}`}>
                {SEVERITY_LABEL[report.severity]}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[report.status]}`}>
                {STATUS_LABEL[report.status]}
              </span>
            </div>
          </div>
          <Link
            href={`/dashboard/incident-reports/${report.id}/print`}
            target="_blank"
            className="shrink-0 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Print
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">Report details</h2>

        {canEdit ? (
          <form onSubmit={saveReport} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Type</label>
                <select value={type} onChange={e => setType(e.target.value as IncidentType)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Severity</label>
                <select value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">What happened?</label>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Employee involved</label>
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">None / not applicable</option>
                  {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Witnesses</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-slate-700">
                  {members.map(member => (
                    <label key={member.user_id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                      <input type="checkbox" checked={witnessIds.includes(member.user_id)} onChange={() => toggleWitness(member.user_id)} />
                      {member.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {type === 'injury' && (
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Body part affected</label>
                  <input value={bodyPart} onChange={e => setBodyPart(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                  <input type="checkbox" checked={firstAidGiven} onChange={e => setFirstAidGiven(e.target.checked)} />
                  First aid given
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                  <input type="checkbox" checked={medicalTreatmentRequired} onChange={e => setMedicalTreatmentRequired(e.target.checked)} />
                  Medical treatment required
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                  <input type="checkbox" checked={timeOffWork} onChange={e => setTimeOffWork(e.target.checked)} />
                  Resulted in time off work
                </label>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Root cause / contributing factors</label>
              <textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Corrective action taken / recommended</label>
              <textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>

            {reportError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{reportError}</p>}
            <button type="submit" disabled={savingReport} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {savingReport ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
              <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">What happened</dt>
              <dd className="whitespace-pre-wrap font-semibold text-gray-700 dark:text-slate-200">{report.description}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Location</dt>
              <dd className="font-bold text-gray-900 dark:text-slate-100">{report.location ?? 'Not set'}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Employee involved</dt>
              <dd className="font-bold text-gray-900 dark:text-slate-100">{memberName(report.employee_id)}</dd>
            </div>
            {report.witness_ids.length > 0 && (
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Witnesses</dt>
                <dd className="font-bold text-gray-900 dark:text-slate-100">{report.witness_ids.map(id => memberName(id)).join(', ')}</dd>
              </div>
            )}
            {report.type === 'injury' && (
              <>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Body part</dt>
                  <dd className="font-bold text-gray-900 dark:text-slate-100">{report.body_part ?? 'Not set'}</dd>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">First aid / treatment / time off</dt>
                  <dd className="font-bold text-gray-900 dark:text-slate-100">
                    {[report.first_aid_given && 'First aid', report.medical_treatment_required && 'Medical treatment', report.time_off_work && 'Time off work'].filter(Boolean).join(', ') || 'None'}
                  </dd>
                </div>
              </>
            )}
            {report.root_cause && (
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Root cause</dt>
                <dd className="whitespace-pre-wrap font-semibold text-gray-700 dark:text-slate-200">{report.root_cause}</dd>
              </div>
            )}
            {report.corrective_action && (
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Corrective action</dt>
                <dd className="whitespace-pre-wrap font-semibold text-gray-700 dark:text-slate-200">{report.corrective_action}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <Camera size={18} className="text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Photos</h2>
        </div>

        {canEdit && (
          <form onSubmit={uploadPhoto} className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-600 hover:file:bg-cyan-100" />
            <button type="submit" disabled={uploadingPhoto || !photoFile} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {uploadingPhoto ? 'Uploading...' : 'Add photo'}
            </button>
            {photoError && <p className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{photoError}</p>}
          </form>
        )}

        {photos.length === 0 ? (
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No photos attached.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map(photo => photo.url && (
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-gray-100 dark:border-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Incident photo" className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          {isOpen ? <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" /> : <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Review</h2>
        </div>

        {isOpen ? (
          canManage ? (
            <form onSubmit={closeReport} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Resolution notes</label>
                <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              {closeError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{closeError}</p>}
              <button type="submit" disabled={closing} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                {closing ? 'Closing...' : 'Close report'}
              </button>
            </form>
          ) : (
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">Awaiting review by a manager or admin.</p>
          )
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Reviewed by</dt>
              <dd className="font-bold text-gray-900 dark:text-slate-100">{memberName(report.reviewed_by)}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Reviewed at</dt>
              <dd className="font-bold text-gray-900 dark:text-slate-100">{displayDateTime(report.reviewed_at)}</dd>
            </div>
            {report.resolution_notes && (
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Resolution notes</dt>
                <dd className="whitespace-pre-wrap font-semibold text-gray-700 dark:text-slate-200">{report.resolution_notes}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `pnpm run build` — must pass clean; confirm
`/dashboard/incident-reports/[id]` appears in the route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/incident-reports/[id]/page.tsx src/components/incident-reports/IncidentReportDetailClient.tsx
git commit -m "handover: C-4 incident report detail page — view, edit, close, photos"
```

---

### Task 5: Print view

**Files:**
- Create: `src/app/dashboard/incident-reports/[id]/print/page.tsx`
- Modify: `src/components/DashboardShell.tsx`

**Interfaces:**
- Consumes: `IncidentReport` (Task 2), `TYPE_LABEL`/`SEVERITY_LABEL` (Task 3).

- [ ] **Step 1: Modify `src/components/DashboardShell.tsx`**

Read the file first. Find:
```tsx
  const isInvoicePrint = pathname.startsWith('/dashboard/invoices/') && pathname.endsWith('/print')
```
Change to (generalizes the same shell-bypass to also match this feature's
print route, renaming the variable since it's no longer invoice-specific —
update its one other use-site in this same file, the `if (isInvoicePrint)`
block a few lines below, to match):
```tsx
  const isPrintRoute = (pathname.startsWith('/dashboard/invoices/') || pathname.startsWith('/dashboard/incident-reports/')) && pathname.endsWith('/print')
```
Then find:
```tsx
  if (isInvoicePrint) {
    return <div className="invoice-print-shell min-h-screen bg-white text-slate-900">{children}</div>
  }
```
Change to:
```tsx
  if (isPrintRoute) {
    return <div className="invoice-print-shell min-h-screen bg-white text-slate-900">{children}</div>
  }
```
(The `invoice-print-shell` class name itself is left as-is — its only job is
hiding the fixed sidebar/header via the `.invoice-print-shell > .fixed { display: none !important; }`
rule already defined in the invoice print page's inline `<style>` block, which
Task 1's page below reuses verbatim for the same reason. Renaming that CSS
class is out of scope for this plan — it works correctly as-is regardless of
which print page it wraps.)

- [ ] **Step 2: Create `src/app/dashboard/incident-reports/[id]/print/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { TYPE_LABEL, SEVERITY_LABEL } from '@/lib/incident-reports'
import type { IncidentReport } from '@/types/incident-reports'

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function IncidentReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: report } = await supabase.from('incident_reports').select('*').eq('id', id).maybeSingle()
  if (!report) notFound()

  const currentReport = report as IncidentReport

  const memberIds = [currentReport.employee_id, currentReport.filed_by, currentReport.reviewed_by, ...currentReport.witness_ids].filter((v): v is string => !!v)
  const { data: members } = await supabase
    .from('organisation_members')
    .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
    .eq('org_id', currentReport.org_id)
    .in('user_id', memberIds)

  const nameById = new Map(((members ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[])
    .map(m => [m.user_id, m.profiles?.full_name || m.profiles?.email || 'Unnamed member']))

  const name = (id: string | null) => (id ? nameById.get(id) ?? 'Unknown' : '—')

  return (
    <>
      <style>{`
          .incident-print-page, .incident-print-page * { box-sizing: border-box; }
          .invoice-print-shell > .fixed { display: none !important; }
          .incident-print-page { max-width: 780px; margin: 0 auto; padding: 48px; font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; color: #111827; background: #fff; }
          .incident-print-page .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px; }
          .incident-print-page .logo { font-size: 22px; font-weight: 900; color: #0f172a; }
          .incident-print-page .title h1 { font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; text-align: right; }
          .incident-print-page .status { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #f3f4f6; color: #4b5563; }
          .incident-print-page .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 32px; }
          .incident-print-page .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px; }
          .incident-print-page .meta-value { font-weight: 600; color: #111827; }
          .incident-print-page .section { margin-bottom: 24px; }
          .incident-print-page .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 6px; }
          .incident-print-page .section-body { color: #374151; line-height: 1.6; white-space: pre-wrap; }
          .incident-print-page .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `}</style>
      <div className="incident-print-page">
        <div className="header">
          <div className="logo">TimeWiseHub</div>
          <div className="title">
            <h1>Incident Report</h1>
            <div className="status">{currentReport.status}</div>
          </div>
        </div>

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

        <div className="section">
          <div className="section-label">What happened</div>
          <div className="section-body">{currentReport.description}</div>
        </div>

        {currentReport.witness_ids.length > 0 && (
          <div className="section">
            <div className="section-label">Witnesses</div>
            <div className="section-body">{currentReport.witness_ids.map(id => name(id)).join(', ')}</div>
          </div>
        )}

        {currentReport.type === 'injury' && (
          <div className="section">
            <div className="section-label">Injury details</div>
            <div className="section-body">
              Body part: {currentReport.body_part ?? '—'}{'\n'}
              First aid given: {currentReport.first_aid_given ? 'Yes' : 'No'}{'\n'}
              Medical treatment required: {currentReport.medical_treatment_required ? 'Yes' : 'No'}{'\n'}
              Resulted in time off work: {currentReport.time_off_work ? 'Yes' : 'No'}
            </div>
          </div>
        )}

        {currentReport.root_cause && (
          <div className="section">
            <div className="section-label">Root cause</div>
            <div className="section-body">{currentReport.root_cause}</div>
          </div>
        )}

        {currentReport.corrective_action && (
          <div className="section">
            <div className="section-label">Corrective action</div>
            <div className="section-body">{currentReport.corrective_action}</div>
          </div>
        )}

        {currentReport.status === 'closed' && (
          <div className="section">
            <div className="section-label">Review</div>
            <div className="section-body">
              Reviewed by: {name(currentReport.reviewed_by)}{'\n'}
              Reviewed at: {fmtDateTime(currentReport.reviewed_at)}{'\n'}
              {currentReport.resolution_notes ? `Resolution notes: ${currentReport.resolution_notes}` : ''}
            </div>
          </div>
        )}

        <div className="footer">Generated by TimeWiseHub · timewisehub.vercel.app</div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Build**

Run: `pnpm run build` — must pass clean; confirm
`/dashboard/incident-reports/[id]/print` appears in the route table, and
visiting an invoice print page still renders without the sidebar (manual
check — confirms the `isPrintRoute` rename didn't break the existing
behaviour).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/incident-reports/[id]/print/page.tsx src/components/DashboardShell.tsx
git commit -m "handover: C-5 incident report print view"
```

---

### Task 6: Dashboard "Today" widget integration

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `IncidentReport` (Task 2).
- Produces: `UpcomingIncidentReport` type, `incidentReportsDue` prop on
  `DashboardUpcoming` — nothing later depends on this, it's the final task.

- [ ] **Step 1: Modify `src/components/dashboard/DashboardUpcoming.tsx`**

Read the file first (it currently ends its "Today" list with `vehiclesDue`
before `approvals` — this task's new section goes in that same relative
position, right after `vehiclesDue`).

Add `ShieldAlert` to the existing `lucide-react` import line.

Add a new exported type near the other `Upcoming*` types, after
`UpcomingVehicleDue`:
```ts
export type UpcomingIncidentReport = {
  id: string
  type: 'injury' | 'near_miss' | 'hazard'
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  occurred_at: string
}
```

Add `incidentReportsDue` to the component's props (both the destructuring and
the type), placed right after `vehiclesDue`:
```tsx
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

Find the empty-state early return:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0) return null
```
Change to:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && incidentReportsDue.length === 0) return null
```

Find the `vehiclesDue.map(...)` block's `isLast` line:
```tsx
          const isLast = i === vehiclesDue.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```
Change to (this block is no longer necessarily last — the new section can
follow it):
```tsx
          const isLast = i === vehiclesDue.length - 1 && incidentReportsDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```

Immediately after the closing `})}` of the `vehiclesDue.map(...)` block (i.e.
right before `{approvals.map((approval, i) => (`), add a new block:
```tsx
        {incidentReportsDue.map((report, i) => {
          const severityLabel = report.severity.charAt(0).toUpperCase() + report.severity.slice(1)
          const urgency = report.severity === 'critical' || report.severity === 'serious'
            ? 'text-red-600 dark:text-red-400'
            : 'text-amber-600 dark:text-amber-400'
          const isLast = i === incidentReportsDue.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`incident-${report.id}`}
              href={`/dashboard/incident-reports/${report.id}`}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <ShieldAlert size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  Incident report awaiting review
                </p>
                <p className={`text-xs font-bold ${urgency}`}>{severityLabel} — open</p>
              </div>
            </Link>
          )
        })}
```

- [ ] **Step 2: Modify `src/app/dashboard/page.tsx`**

Read the file first. Find the import of types from
`@/components/dashboard/DashboardUpcoming`:
```ts
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue } from '@/components/dashboard/DashboardUpcoming'
```
Change to:
```ts
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingIncidentReport } from '@/components/dashboard/DashboardUpcoming'
```

Find the `Promise.all` destructuring and its final array entry (note
`vehiclesRes` is fetched unconditionally, with no `isManager`/`orgId` ternary
gate — visibility is left entirely to RLS, and this task follows that exact
same precedent rather than adding a redundant app-level role check):
```ts
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes, dueExpensesRes, dueBusinessExpensesRes, vehiclesRes] = await Promise.all([
```
Change to:
```ts
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes, dueExpensesRes, dueBusinessExpensesRes, vehiclesRes, incidentReportsRes] = await Promise.all([
```

Find the last entry in that same `Promise.all([...])` array:
```ts
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
  ])
```
Change to:
```ts
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
    supabase.from('incident_reports').select('id, type, severity, occurred_at').eq('status', 'open').order('occurred_at', { ascending: false }),
  ])
```

Find where `vehiclesDue` is computed (the `for (const v of (vehiclesRes.data ?? [])...)` loop) and add, right after that loop:
```ts
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]
```

Find the `<DashboardUpcoming ... vehiclesDue={vehiclesDue} currentUserId={user.id} />` call and add `incidentReportsDue={incidentReportsDue}` right before `currentUserId`:
```tsx
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```

- [ ] **Step 3: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx
git commit -m "handover: C-6 open incident reports on the Dashboard Today widget"
```

---

## Manual verification (no test runner in this project)
1. As owner/admin/manager: file a report via "+ New report" on
   `/dashboard/incident-reports`, confirm it appears in the list.
2. As an employee (no manager/admin/manager role): confirm the "+ New report"
   button is absent, and confirm you cannot see a report you're not named in
   (direct URL to another employee's report should not resolve any data).
3. As the employee named in `employee_id` (or in `witness_ids`) on a report:
   confirm you CAN view that specific report, read-only — no edit form, no
   close form.
4. As a manager whose crew does not include the report's `employee_id`:
   confirm the report does not appear in your list.
5. Close a report as a manager/admin; confirm the edit form disappears and
   the review section becomes read-only. Confirm attempting a raw
   `supabase.from('incident_reports').update(...)` against a closed report's
   id fails for every role, including the owner (RLS, not just UI).
6. Attempt a `supabase.from('incident_reports').delete()` call against any
   report as the owner — confirm it fails (no DELETE policy exists).
7. Upload a photo to an open report; confirm it displays and the signed URL
   opens the image. Confirm the upload option disappears once the report is
   closed.
8. Visit the print page for a report; confirm it renders without the sidebar
   and prints/saves-as-PDF cleanly via the browser's own print dialog. Visit
   an existing invoice's print page too, to confirm the `isPrintRoute` rename
   in `DashboardShell.tsx` didn't regress it.
9. File a report with severity `serious` or `critical`; confirm it appears on
   the Dashboard "Today" widget for owner/admin/manager, and does not appear
   for an employee with no connection to it. Close it; confirm it drops off
   the widget.
