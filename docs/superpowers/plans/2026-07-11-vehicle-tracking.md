# Vehicle Tracking Implementation Plan

> **For agentic workers:** This project uses the handover loop (Claude=conductor, Codex=implementer via `.handover/`), not `subagent-driven-development`/`executing-plans`. See `.handover/spec.md` for the turn-by-turn checklist derived from this plan.

**Goal:** Track company vehicles (rego, year/make/model, servicing schedule, odometer history, employee assignment) with vehicle-related costs feeding directly into the existing Business Expenses system.

**Architecture:** Two new tables (`vehicles`, `vehicle_odometer_logs`) plus a nullable `vehicle_id` FK on the existing `expenses` table. A new "Vehicles" section on the Expenses page and a vehicle detail route. Visibility is RLS-enforced: owner/admin see everything, managers are crew-scoped, an assigned employee sees only their own vehicle.

**Tech Stack:** Next.js App Router, Supabase (Postgres RLS, one SECURITY DEFINER RPC), Tailwind, `lucide-react`. No new npm dependencies.

**Note on the source spec:** `docs/superpowers/specs/2026-07-11-vehicle-tracking-design.md` says "`ExpenseForm` gains a new optional vehicle-picker dropdown." That's a naming slip — `ExpenseForm.tsx` only ever creates personal (`is_business = false`) expenses; the actual business-expense creation form lives inline inside `BusinessExpensesView.tsx`. Task 4 below extends the correct component. The vehicle detail page also gets its own small, self-contained expense-logging form (Task 3) since an assigned employee needs to log a vehicle expense but is never shown `BusinessExpensesView` at all (that component is manager+-gated).

## Global Constraints
- No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every task, plus manual smoke testing.
- Codex handles text edits only; the conductor runs all shell/git commands and the DB migration via Supabase MCP.
- Vehicles is gated behind `isTeamPlan(subscription)`, matching `BusinessExpensesView`/`ManagerExpenseView` precedent — it's inherently a team/fleet feature.
- 30-day date windows and a 500km window are the servicing/rego "due soon" thresholds (per the approved spec) — defined as named constants, not magic numbers, so they're easy to tune later.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-098-vehicle-tracking.sql`

**Interfaces:**
- Produces: tables `vehicles`, `vehicle_odometer_logs`; column `expenses.vehicle_id`; function `can_access_vehicle(p_org_id uuid, p_assigned_user_id uuid) returns boolean`; RPC `log_vehicle_odometer(p_vehicle_id uuid, p_odometer_km integer, p_notes text default null) returns vehicle_odometer_logs`. All later tasks depend on these exact names.

This task is **conductor-only** — Codex does not touch it. The conductor writes this file, applies it via Supabase MCP `apply_migration` (name: `vehicle_tracking`), and commits the file.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 098: Vehicle tracking
-- Tracks company vehicles (rego, year/make/model, servicing schedule,
-- odometer history, employee assignment). Vehicle-related costs are just
-- normal `is_business` expense rows tagged with `vehicle_id` — that's the
-- entire "feeds business expenses" mechanism, no separate ledger.
--
-- Visibility (via can_access_vehicle()):
--   - owner/admin: always, org-wide.
--   - manager: unassigned vehicles, vehicles assigned to someone in no
--     crew, or vehicles assigned to someone in a crew THIS manager runs
--     (crews.manager_id) — new crew-scoped pattern, not used elsewhere yet.
--   - anyone: if they are the vehicle's own assignee (view + log km/
--     expenses only — editing is separately gated to manager+ by role).
-- Run via Supabase MCP apply_migration (name: vehicle_tracking)
-- ============================================================

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  registration_number text not null,
  year smallint,
  make text,
  model text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  current_odometer_km integer,
  next_service_due_date date,
  next_service_due_km integer,
  rego_expiry_date date,
  notes text,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index vehicles_org_id_idx on public.vehicles(org_id);
create index vehicles_assigned_user_id_idx on public.vehicles(assigned_user_id);
create index vehicles_registration_number_idx on public.vehicles(registration_number);

create table public.vehicle_odometer_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  odometer_km integer not null,
  logged_at date not null default current_date,
  logged_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

create index vehicle_odometer_logs_vehicle_id_idx on public.vehicle_odometer_logs(vehicle_id);

alter table public.expenses add column vehicle_id uuid references public.vehicles(id) on delete set null;
create index expenses_vehicle_id_idx on public.expenses(vehicle_id);

alter table public.vehicles enable row level security;
alter table public.vehicle_odometer_logs enable row level security;

create or replace function public.can_access_vehicle(p_org_id uuid, p_assigned_user_id uuid)
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
            p_assigned_user_id is null
            or not exists (select 1 from crew_members cm where cm.user_id = p_assigned_user_id)
            or exists (
              select 1 from crew_members cm
              join crews c on c.id = cm.crew_id
              where cm.user_id = p_assigned_user_id and c.manager_id = auth.uid()
            )
          )
        )
      )
    )
    or p_assigned_user_id = auth.uid();
$$;

create policy "Users can view accessible vehicles"
  on public.vehicles for select
  using (can_access_vehicle(org_id, assigned_user_id));

create policy "Managers+ can create vehicles"
  on public.vehicles for insert
  with check (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  );

create policy "Managers+ can update accessible vehicles"
  on public.vehicles for update
  using (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  )
  with check (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  );

create policy "Admins can delete vehicles"
  on public.vehicles for delete
  using (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

create policy "Users can view odometer logs for accessible vehicles"
  on public.vehicle_odometer_logs for select
  using (
    exists (
      select 1 from vehicles v
      where v.id = vehicle_odometer_logs.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

create policy "Users can log odometer readings for accessible vehicles"
  on public.vehicle_odometer_logs for insert
  with check (
    logged_by = auth.uid()
    and exists (
      select 1 from vehicles v
      where v.id = vehicle_odometer_logs.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

-- Assigned employees (any role) can log/view business expenses tagged to
-- their own vehicle, in addition to the existing manager-creates/
-- admin-approves business-expense policies (schema-096) — Postgres ORs
-- multiple permissive policies together for the same command, so this is
-- additive, not a change to the existing rule.
create policy "Assigned employee can log expenses for their vehicle"
  on public.expenses for insert
  with check (
    is_business
    and user_id = auth.uid()
    and vehicle_id is not null
    and exists (select 1 from vehicles v where v.id = expenses.vehicle_id and v.assigned_user_id = auth.uid())
  );

create policy "Assigned employee can view expenses for their vehicle"
  on public.expenses for select
  using (
    vehicle_id is not null
    and exists (select 1 from vehicles v where v.id = expenses.vehicle_id and v.assigned_user_id = auth.uid())
  );

-- Inserting an odometer log also updates the vehicle's denormalized
-- current_odometer_km. A SECURITY DEFINER RPC (not a raw table UPDATE) is
-- required because the assigned employee is deliberately NOT granted
-- vehicles UPDATE by the policies above — their only sanctioned write to
-- the vehicle record is via this narrow, purpose-built function.
create or replace function public.log_vehicle_odometer(
  p_vehicle_id uuid,
  p_odometer_km integer,
  p_notes text default null
)
returns public.vehicle_odometer_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_assigned_user_id uuid;
  v_log public.vehicle_odometer_logs;
begin
  select org_id, assigned_user_id into v_org_id, v_assigned_user_id
  from vehicles where id = p_vehicle_id;

  if v_org_id is null then
    raise exception 'Vehicle not found';
  end if;

  if not can_access_vehicle(v_org_id, v_assigned_user_id) then
    raise exception 'Not authorised to log an odometer reading for this vehicle';
  end if;

  insert into vehicle_odometer_logs (vehicle_id, odometer_km, logged_by, notes)
  values (p_vehicle_id, p_odometer_km, auth.uid(), p_notes)
  returning * into v_log;

  update vehicles set current_odometer_km = p_odometer_km where id = p_vehicle_id;

  return v_log;
end;
$$;
```

- [ ] **Step 2: Apply via Supabase MCP**

Conductor runs `apply_migration` (project id `sdwwlnnsijcadkdwsvud`, name `vehicle_tracking`) with the SQL above.

- [ ] **Step 3: Verify**

Run: `list_migrations` (confirm it appears) and a quick `execute_sql` sanity check:
```sql
select can_access_vehicle(
  (select id from organisations limit 1),
  null
);
```
Expected: returns a boolean without error (confirms the function compiles and the org lookup works).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-098-vehicle-tracking.sql
git commit -m "handover: C-1 vehicle tracking schema + RLS + odometer RPC"
```

---

### Task 2: Vehicles list on the Expenses page

**Files:**
- Create: `src/types/vehicles.ts`
- Create: `src/lib/vehicles.ts`
- Create: `src/components/vehicles/VehiclesView.tsx`
- Modify: `src/app/dashboard/expenses/page.tsx`

**Interfaces:**
- Consumes: `daysUntil` from `@/lib/expenses` (existing); `useTextFilter` from `@/lib/use-text-filter` (existing); `SearchInput` from `@/components/ui/SearchInput` (existing, props `{ value: string; onChange: (v: string) => void; placeholder?: string }`).
- Produces: types `Vehicle`, `VehicleOdometerLog` (`src/types/vehicles.ts`); `regoStatus()`, `serviceStatus()`, `STATUS_LABEL`, `STATUS_COLOUR`, `VehicleStatus`, and the threshold constants `SERVICE_DUE_DATE_WINDOW_DAYS`/`SERVICE_DUE_KM_WINDOW`/`REGO_DUE_WINDOW_DAYS` (`src/lib/vehicles.ts`) — Task 5 imports these same constants/functions for the dashboard widget, so names must match exactly.

- [ ] **Step 1: Create the types file**

```ts
// src/types/vehicles.ts
export type Vehicle = {
  id: string
  org_id: string
  registration_number: string
  year: number | null
  make: string | null
  model: string | null
  assigned_user_id: string | null
  current_odometer_km: number | null
  next_service_due_date: string | null
  next_service_due_km: number | null
  rego_expiry_date: string | null
  notes: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}

export type VehicleOdometerLog = {
  id: string
  vehicle_id: string
  odometer_km: number
  logged_at: string
  logged_by: string | null
  notes: string | null
  created_at: string
}
```

- [ ] **Step 2: Create the status-helpers lib file**

```ts
// src/lib/vehicles.ts
import { daysUntil } from '@/lib/expenses'
import type { Vehicle } from '@/types/vehicles'

export const SERVICE_DUE_DATE_WINDOW_DAYS = 30
export const SERVICE_DUE_KM_WINDOW = 500
export const REGO_DUE_WINDOW_DAYS = 30

export type VehicleStatus = 'ok' | 'due_soon' | 'overdue'

export function regoStatus(vehicle: Pick<Vehicle, 'rego_expiry_date'>): VehicleStatus {
  if (!vehicle.rego_expiry_date) return 'ok'
  const days = daysUntil(vehicle.rego_expiry_date)
  if (days < 0) return 'overdue'
  if (days <= REGO_DUE_WINDOW_DAYS) return 'due_soon'
  return 'ok'
}

export function serviceStatus(
  vehicle: Pick<Vehicle, 'next_service_due_date' | 'next_service_due_km' | 'current_odometer_km'>,
): VehicleStatus {
  let status: VehicleStatus = 'ok'

  if (vehicle.next_service_due_date) {
    const days = daysUntil(vehicle.next_service_due_date)
    if (days < 0) return 'overdue'
    if (days <= SERVICE_DUE_DATE_WINDOW_DAYS) status = 'due_soon'
  }

  if (vehicle.next_service_due_km != null && vehicle.current_odometer_km != null) {
    const kmRemaining = vehicle.next_service_due_km - vehicle.current_odometer_km
    if (kmRemaining < 0) return 'overdue'
    if (kmRemaining <= SERVICE_DUE_KM_WINDOW) status = 'due_soon'
  }

  return status
}

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  ok: 'OK',
  due_soon: 'Due soon',
  overdue: 'Overdue',
}

export const STATUS_COLOUR: Record<VehicleStatus, string> = {
  ok: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
  due_soon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  overdue: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
}
```

- [ ] **Step 3: Create `VehiclesView.tsx`**

```tsx
// src/components/vehicles/VehiclesView.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Car } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
import { regoStatus, serviceStatus, STATUS_LABEL, STATUS_COLOUR } from '@/lib/vehicles'
import type { Vehicle } from '@/types/vehicles'

export type OrgMemberOption = { user_id: string; name: string }

export default function VehiclesView({
  vehicles,
  orgId,
  members,
  canManage,
}: {
  vehicles: Vehicle[]
  orgId: string
  members: OrgMemberOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const { query, setQuery, filtered } = useTextFilter(vehicles, v => v.registration_number)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rego, setRego] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')

  function resetForm() {
    setRego(''); setYear(''); setMake(''); setModel(''); setAssignedUserId(''); setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('vehicles').insert({
      org_id: orgId,
      registration_number: rego.trim().toUpperCase(),
      year: year ? parseInt(year, 10) : null,
      make: make.trim() || null,
      model: model.trim() || null,
      assigned_user_id: assignedUserId || null,
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vehicles</h2>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Registration, servicing and costs feed straight into business expenses.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setOpen(v => !v)}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            {open ? 'Cancel' : '+ Add vehicle'}
          </button>
        )}
      </div>

      {open && canManage && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Registration *</label>
              <input required value={rego} onChange={e => setRego(e.target.value)} placeholder="ABC123"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Year</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2022"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Make</label>
              <input value={make} onChange={e => setMake(e.target.value)} placeholder="Toyota"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Model</label>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="Hilux"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Assigned to</label>
            <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={saving}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Add vehicle'}
          </button>
        </form>
      )}

      {vehicles.length > 3 && (
        <div className="mb-4"><SearchInput value={query} onChange={setQuery} placeholder="Search by registration…" /></div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
          {vehicles.length === 0 ? 'No vehicles yet.' : 'No matches.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(vehicle => {
            const rego_ = regoStatus(vehicle)
            const service = serviceStatus(vehicle)
            const assignee = members.find(m => m.user_id === vehicle.assigned_user_id)
            return (
              <Link key={vehicle.id} href={`/dashboard/expenses/vehicles/${vehicle.id}`}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30">
                <div className="flex items-center gap-2">
                  <Car size={16} className="text-gray-400 dark:text-slate-500" />
                  <p className="font-bold text-gray-900 dark:text-slate-100">{vehicle.registration_number}</p>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No details yet'}
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
                  {assignee ? assignee.name : 'Unassigned'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLOUR[rego_]}`}>Rego: {STATUS_LABEL[rego_]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLOUR[service]}`}>Service: {STATUS_LABEL[service]}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Modify `src/app/dashboard/expenses/page.tsx`**

Replace the whole file with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ManagerExpenseView from '@/components/expenses/ManagerExpenseView'
import BusinessExpensesView from '@/components/expenses/BusinessExpensesView'
import SubscriptionsView from '@/components/expenses/SubscriptionsView'
import VehiclesView, { type OrgMemberOption } from '@/components/vehicles/VehiclesView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { Vehicle } from '@/types/vehicles'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: categories }, { data: membership }, subscription] = await Promise.all([
    supabase.from('expenses').select('*, expense_categories(name)').eq('user_id', user.id).order('expense_date', { ascending: false }),
    supabase.from('expense_categories').select('id, name').order('name'),
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const isAdminOrOwner = ['owner', 'admin'].includes(membership?.role ?? '')
  const orgId = membership?.org_id ?? null

  let vehicles: Vehicle[] = []
  let vehicleMembers: OrgMemberOption[] = []

  if (orgId && isTeamPlan(subscription)) {
    const [{ data: vehiclesData }, { data: membersData }] = await Promise.all([
      supabase.from('vehicles').select('*').eq('org_id', orgId).eq('is_archived', false).order('registration_number'),
      supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId),
    ])
    vehicles = (vehiclesData ?? []) as Vehicle[]
    vehicleMembers = ((membersData ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[])
      .map(m => ({ user_id: m.user_id, name: m.profiles?.full_name || m.profiles?.email || 'Unknown' }))
  }

  const showVehicles = vehicles.length > 0 || isManager

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl space-y-6">
        <ExpenseForm categories={categories ?? []} userId={user.id} orgId={membership?.org_id ?? null} />
        <SubscriptionsView userId={user.id} orgId={membership?.org_id ?? null} categories={categories ?? []} />
        <ExpenseList initialExpenses={expenses ?? []} categories={categories ?? []} userId={user.id} />
        {isManager && membership?.org_id && (
          <BusinessExpensesView userId={user.id} orgId={membership.org_id} categories={categories ?? []} canApprove={isAdminOrOwner} vehicles={vehicles} />
        )}
        {isManager && membership?.org_id && <ManagerExpenseView orgId={membership.org_id} />}
        {showVehicles && orgId && (
          <VehiclesView vehicles={vehicles} orgId={orgId} members={vehicleMembers} canManage={isManager} />
        )}
      </div>
    </div>
  )
}
```

Note: this passes `vehicles={vehicles}` into `BusinessExpensesView` — that prop doesn't exist yet on that component. Task 4 adds it. Until Task 4 lands, this task's build will fail on that one prop. **Do this task and Task 4 in the same turn** (both are small; splitting them leaves an intermediate broken build, which this project's own convention avoids — see the "Tutoring Year Group/Subject/Topic Structure" precedent in `.handover/decisions.md`).

- [ ] **Step 5: Build**

Run: `pnpm run build` — will fail until Task 4's `BusinessExpensesView` prop change lands (see note above). Proceed directly to Task 4 before committing either.

---

### Task 3: Vehicle detail page

**Files:**
- Create: `src/app/dashboard/expenses/vehicles/[id]/page.tsx`
- Create: `src/components/vehicles/VehicleDetailClient.tsx`

**Interfaces:**
- Consumes: `Vehicle`, `VehicleOdometerLog` from `@/types/vehicles`; `regoStatus`, `serviceStatus`, `STATUS_LABEL`, `STATUS_COLOUR` from `@/lib/vehicles`; `REVIEW_STATUS_LABEL`, `REVIEW_STATUS_COLOUR`, `ReviewStatus` from `@/lib/expenses`; RPC `log_vehicle_odometer` (Task 1).
- Produces: route `/dashboard/expenses/vehicles/[id]`, linked from `VehiclesView` (Task 2).

- [ ] **Step 1: Create the detail page (server component)**

```tsx
// src/app/dashboard/expenses/vehicles/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VehicleDetailClient from '@/components/vehicles/VehicleDetailClient'
import type { Vehicle, VehicleOdometerLog } from '@/types/vehicles'

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vehicle } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle()
  if (!vehicle) notFound()

  const [{ data: logs }, { data: expenses }, { data: membership }, { data: membersData }, { data: categories }] = await Promise.all([
    supabase.from('vehicle_odometer_logs').select('*').eq('vehicle_id', id).order('logged_at', { ascending: false }),
    supabase.from('expenses').select('*, expense_categories(name)').eq('vehicle_id', id).order('expense_date', { ascending: false }),
    supabase.from('organisation_members').select('role').eq('user_id', user.id).eq('org_id', vehicle.org_id).maybeSingle(),
    supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', vehicle.org_id),
    supabase.from('expense_categories').select('id, name').order('name'),
  ])

  const role = membership?.role ?? null
  const canEdit = role ? ['owner', 'admin', 'manager'].includes(role) : false
  const canDelete = role ? ['owner', 'admin'].includes(role) : false
  const isAssignedToMe = vehicle.assigned_user_id === user.id
  const members = ((membersData ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[])
    .map(m => ({ user_id: m.user_id, name: m.profiles?.full_name || m.profiles?.email || 'Unknown' }))

  return (
    <VehicleDetailClient
      vehicle={vehicle as Vehicle}
      logs={(logs ?? []) as VehicleOdometerLog[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expenses={(expenses ?? []) as any[]}
      categories={categories ?? []}
      members={members}
      canEdit={canEdit}
      canDelete={canDelete}
      canLog={canEdit || isAssignedToMe}
      userId={user.id}
    />
  )
}
```

- [ ] **Step 2: Create the client component**

```tsx
// src/components/vehicles/VehicleDetailClient.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Car, Gauge } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { regoStatus, serviceStatus, STATUS_LABEL, STATUS_COLOUR } from '@/lib/vehicles'
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOUR, type ReviewStatus } from '@/lib/expenses'
import type { Vehicle, VehicleOdometerLog } from '@/types/vehicles'

type Category = { id: string; name: string }
type OrgMemberOption = { user_id: string; name: string }
type VehicleExpense = {
  id: string
  amount: number
  currency: string
  description: string | null
  expense_date: string
  status: ReviewStatus
  expense_categories: { name: string } | null
}

export default function VehicleDetailClient({
  vehicle,
  logs,
  expenses,
  categories,
  members,
  canEdit,
  canDelete,
  canLog,
  userId,
}: {
  vehicle: Vehicle
  logs: VehicleOdometerLog[]
  expenses: VehicleExpense[]
  categories: Category[]
  members: OrgMemberOption[]
  canEdit: boolean
  canDelete: boolean
  canLog: boolean
  userId: string
}) {
  const router = useRouter()
  const [assignedUserId, setAssignedUserId] = useState(vehicle.assigned_user_id ?? '')
  const [savingAssignment, setSavingAssignment] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [nextServiceDueDate, setNextServiceDueDate] = useState(vehicle.next_service_due_date ?? '')
  const [nextServiceDueKm, setNextServiceDueKm] = useState(vehicle.next_service_due_km?.toString() ?? '')
  const [regoExpiryDate, setRegoExpiryDate] = useState(vehicle.rego_expiry_date ?? '')
  const [savingDetails, setSavingDetails] = useState(false)

  const [showLogKm, setShowLogKm] = useState(false)
  const [odometerKm, setOdometerKm] = useState('')
  const [odometerNotes, setOdometerNotes] = useState('')
  const [savingKm, setSavingKm] = useState(false)
  const [kmError, setKmError] = useState<string | null>(null)

  const [showLogExpense, setShowLogExpense] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategoryId, setExpenseCategoryId] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  const [archiving, setArchiving] = useState(false)

  const rego = regoStatus(vehicle)
  const service = serviceStatus(vehicle)
  const assignee = members.find(m => m.user_id === vehicle.assigned_user_id)

  async function saveAssignment() {
    setSavingAssignment(true)
    const supabase = createClient()
    await supabase.from('vehicles').update({ assigned_user_id: assignedUserId || null }).eq('id', vehicle.id)
    setSavingAssignment(false)
    router.refresh()
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    setSavingDetails(true)
    const supabase = createClient()
    await supabase.from('vehicles').update({
      next_service_due_date: nextServiceDueDate || null,
      next_service_due_km: nextServiceDueKm ? parseInt(nextServiceDueKm, 10) : null,
      rego_expiry_date: regoExpiryDate || null,
    }).eq('id', vehicle.id)
    setSavingDetails(false)
    setShowEdit(false)
    router.refresh()
  }

  async function logKm(e: React.FormEvent) {
    e.preventDefault()
    setSavingKm(true)
    setKmError(null)
    const supabase = createClient()
    const { error } = await supabase.rpc('log_vehicle_odometer', {
      p_vehicle_id: vehicle.id,
      p_odometer_km: parseInt(odometerKm, 10),
      p_notes: odometerNotes || null,
    })
    setSavingKm(false)
    if (error) { setKmError(error.message); return }
    setOdometerKm('')
    setOdometerNotes('')
    setShowLogKm(false)
    router.refresh()
  }

  async function logExpense(e: React.FormEvent) {
    e.preventDefault()
    setSavingExpense(true)
    setExpenseError(null)

    const supabase = createClient()
    let receiptPath: string | null = null

    if (expenseReceipt) {
      const ext = expenseReceipt.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, expenseReceipt)
      if (uploadError) { setExpenseError(uploadError.message); setSavingExpense(false); return }
      receiptPath = path
    }

    const { error } = await supabase.from('expenses').insert({
      user_id: userId,
      org_id: vehicle.org_id,
      vehicle_id: vehicle.id,
      is_business: true,
      category_id: expenseCategoryId || null,
      amount: parseFloat(expenseAmount),
      currency: 'AUD',
      description: expenseDescription || null,
      expense_date: expenseDate,
      receipt_path: receiptPath,
      status: 'submitted',
    })

    setSavingExpense(false)
    if (error) { setExpenseError(error.message); return }
    setExpenseAmount(''); setExpenseCategoryId(''); setExpenseDescription(''); setExpenseReceipt(null)
    setShowLogExpense(false)
    router.refresh()
  }

  async function archiveVehicle() {
    if (!confirm(`Archive ${vehicle.registration_number}? It stays in expense history but drops off the active list.`)) return
    setArchiving(true)
    const supabase = createClient()
    await supabase.from('vehicles').update({ is_archived: true }).eq('id', vehicle.id)
    setArchiving(false)
    router.push('/dashboard/expenses')
  }

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/dashboard/expenses"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
          <ChevronLeft className="h-4 w-4" />
          Vehicles
        </Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <Car size={20} />
              </span>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">{vehicle.registration_number}</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No details yet'}
                </p>
              </div>
            </div>
            {canDelete && (
              <button onClick={archiveVehicle} disabled={archiving}
                className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400">
                {archiving ? 'Archiving…' : 'Archive vehicle'}
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[rego]}`}>
              Rego: {STATUS_LABEL[rego]}{vehicle.rego_expiry_date ? ` (${vehicle.rego_expiry_date})` : ''}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[service]}`}>
              Service: {STATUS_LABEL[service]}{vehicle.next_service_due_date ? ` (${vehicle.next_service_due_date})` : ''}
            </span>
            {vehicle.current_odometer_km != null && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                {vehicle.current_odometer_km.toLocaleString()} km
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Assigned to</label>
              {canEdit ? (
                <div className="flex gap-2">
                  <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                  {assignedUserId !== (vehicle.assigned_user_id ?? '') && (
                    <button onClick={saveAssignment} disabled={savingAssignment}
                      className="shrink-0 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                      {savingAssignment ? 'Saving…' : 'Save'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{assignee ? assignee.name : 'Unassigned'}</p>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="mt-4">
              <button onClick={() => setShowEdit(v => !v)} className="text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                {showEdit ? 'Cancel' : 'Edit servicing & registration'}
              </button>
              {showEdit && (
                <form onSubmit={saveDetails} className="mt-3 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</label>
                      <input type="date" value={regoExpiryDate} onChange={e => setRegoExpiryDate(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Next service due (date)</label>
                      <input type="date" value={nextServiceDueDate} onChange={e => setNextServiceDueDate(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Next service due (km)</label>
                      <input type="number" value={nextServiceDueKm} onChange={e => setNextServiceDueKm(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                  <button type="submit" disabled={savingDetails} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                    {savingDetails ? 'Saving…' : 'Save'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Odometer log</h2>
            {canLog && (
              <button onClick={() => setShowLogKm(v => !v)} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">
                {showLogKm ? 'Cancel' : '+ Log reading'}
              </button>
            )}
          </div>

          {showLogKm && canLog && (
            <form onSubmit={logKm} className="mb-4 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Odometer (km) *</label>
                  <input type="number" required min="0" value={odometerKm} onChange={e => setOdometerKm(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Notes</label>
                  <input value={odometerNotes} onChange={e => setOdometerNotes(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </div>
              {kmError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{kmError}</p>}
              <button type="submit" disabled={savingKm} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                {savingKm ? 'Saving…' : 'Log reading'}
              </button>
            </form>
          )}

          {logs.length === 0 ? (
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No odometer readings logged yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {logs.map(log => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <Gauge size={14} className="text-gray-400 dark:text-slate-500" />
                    <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{log.odometer_km.toLocaleString()} km</span>
                    {log.notes && <span className="text-xs text-gray-500 dark:text-slate-400">— {log.notes}</span>}
                  </div>
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{log.logged_at}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Linked expenses</h2>
            {canLog && (
              <button onClick={() => setShowLogExpense(v => !v)} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">
                {showLogExpense ? 'Cancel' : '+ Log expense'}
              </button>
            )}
          </div>

          {showLogExpense && canLog && (
            <form onSubmit={logExpense} className="mb-4 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Amount (AUD) *</label>
                  <input type="number" required min="0.01" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Category</label>
                  <select value={expenseCategoryId} onChange={e => setExpenseCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Uncategorised</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Date</label>
                  <input type="date" required value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Receipt (optional)</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setExpenseReceipt(e.target.files?.[0] ?? null)}
                    className="w-full text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-600 hover:file:bg-cyan-100" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Description</label>
                <input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} placeholder="Fuel, service, tyres…"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              {expenseError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{expenseError}</p>}
              <button type="submit" disabled={savingExpense} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                {savingExpense ? 'Saving…' : 'Submit for approval'}
              </button>
            </form>
          )}

          {expenses.length === 0 ? (
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No expenses logged for this vehicle yet.</p>
          ) : (
            <ul className="space-y-3">
              {expenses.map(expense => (
                <li key={expense.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
                      {expense.currency} {expense.amount.toFixed(2)}
                      {expense.expense_categories && <span className="ml-2 text-xs font-semibold text-gray-500 dark:text-slate-400">{expense.expense_categories.name}</span>}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${REVIEW_STATUS_COLOUR[expense.status]}`}>
                      {REVIEW_STATUS_LABEL[expense.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-slate-400">{expense.expense_date}</p>
                  {expense.description && <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{expense.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Scope note:** this task builds Archive (soft-delete via `is_archived`) as the only retirement UI, matching the spec's stated primary mechanism. The DB already has an admin/owner hard-delete RLS policy (Task 1) for completeness, but no UI button calls it — a genuinely rare action (archiving already removes a vehicle from every active list while preserving expense history) not worth a second confirm-dialog control this pass. Flagging as a deliberate trim, not an oversight.

- [ ] **Step 3: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/expenses/vehicles src/components/vehicles/VehicleDetailClient.tsx
git commit -m "handover: C-3 vehicle detail page (odometer log + linked expenses)"
```

---

### Task 4: Vehicle picker in Business Expenses

**Files:**
- Modify: `src/components/expenses/BusinessExpensesView.tsx`

**Interfaces:**
- Consumes: `Vehicle` from `@/types/vehicles` (Task 2).
- Produces: `BusinessExpensesView` accepts a new `vehicles: Vehicle[]` prop (required by Task 2's `expenses/page.tsx` call site — do this task in the same turn as Task 2, per the note there).

- [ ] **Step 1: Add the `vehicles` prop and import**

In `src/components/expenses/BusinessExpensesView.tsx`, change the import block at the top:

```tsx
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { addInterval, daysUntil, markExpenseCyclePaid, REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOUR, type RecurrenceInterval, type ReviewStatus } from '@/lib/expenses'
import type { Vehicle } from '@/types/vehicles'
```

- [ ] **Step 2: Extend the component's props**

Change:
```tsx
export default function BusinessExpensesView({
  userId,
  orgId,
  categories,
  canApprove,
}: {
  userId: string
  orgId: string
  categories: Category[]
  canApprove: boolean
}) {
```
to:
```tsx
export default function BusinessExpensesView({
  userId,
  orgId,
  categories,
  canApprove,
  vehicles,
}: {
  userId: string
  orgId: string
  categories: Category[]
  canApprove: boolean
  vehicles: Vehicle[]
}) {
```

- [ ] **Step 3: Add vehicle-select state**

Right after the existing `const [nextBillingDate, setNextBillingDate] = useState(today())` line, add:
```tsx
  const [vehicleId, setVehicleId] = useState('')
```

- [ ] **Step 4: Include `vehicle_id` in the insert payload and reset it on submit**

Change the `payload` object inside `handleSubmit`:
```tsx
    const payload = {
      user_id: userId,
      org_id: orgId,
      is_business: true,
      category_id: categoryId || null,
      amount: parseFloat(amount),
      currency,
      description: description || null,
      status: 'submitted',
      is_recurring: recurring,
      recurrence_interval: recurring ? interval : null,
      next_billing_date: recurring ? nextBillingDate : null,
      expense_date: recurring ? nextBillingDate : today(),
      vehicle_id: vehicleId || null,
    }
```

And in `resetForm()`, add `setVehicleId('')` alongside the other resets:
```tsx
  function resetForm() {
    setDescription('')
    setCategoryId('')
    setAmount('')
    setCurrency('AUD')
    setRecurring(false)
    setInterval('monthly')
    setNextBillingDate(today())
    setVehicleId('')
    setError(null)
  }
```

- [ ] **Step 5: Add the dropdown to the form** (only rendered when there's at least one vehicle)

Insert this block right after the existing Description/Category grid (`</div>` that closes the `grid grid-cols-1 gap-3 sm:grid-cols-2` containing Description and Category), before the Amount/Currency grid:

```tsx
          {vehicles.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Vehicle (optional)</label>
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">Not vehicle-related</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
              </select>
            </div>
          )}
```

- [ ] **Step 6: Build**

Run: `pnpm run build` — must pass clean. This is the point where Task 2's `expenses/page.tsx` (which already passes `vehicles={vehicles}`) and this task's new required prop finally agree — build should go green here if it was red after Task 2 alone.

- [ ] **Step 7: Commit both Task 2 and Task 4 together**

```bash
git add src/types/vehicles.ts src/lib/vehicles.ts src/components/vehicles/VehiclesView.tsx src/app/dashboard/expenses/page.tsx src/components/expenses/BusinessExpensesView.tsx
git commit -m "handover: C-2/C-4 vehicles list on Expenses page + vehicle-tag business expenses"
```

---

### Task 5: Dashboard "Today" vehicle due-items

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `regoStatus`, `serviceStatus`, `REGO_DUE_WINDOW_DAYS`, `SERVICE_DUE_DATE_WINDOW_DAYS`, `SERVICE_DUE_KM_WINDOW` from `@/lib/vehicles` (Task 2); `daysUntil` from `@/lib/expenses`.
- Produces: `DashboardUpcoming` accepts a new `vehiclesDue: UpcomingVehicleDue[]` prop.

- [ ] **Step 1: Add the new type and icon imports to `DashboardUpcoming.tsx`**

Change the top imports:
```tsx
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench } from 'lucide-react'
```

Add the new exported type right after `UpcomingDueExpense`:
```tsx
export type UpcomingVehicleDue = {
  id: string
  registration_number: string
  kind: 'rego' | 'service'
  daysUntilDue: number
}
```

- [ ] **Step 2: Accept the new prop**

Change the component signature:
```tsx
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
  currentUserId: string
}) {
```

- [ ] **Step 3: Include vehicle items in the empty-state check**

Change:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0) return null
```
to:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0) return null
```

- [ ] **Step 4: Render the vehicle-due rows**

Insert this block right after the `visibleDueBusinessExpenses.map(...)` block closes (right before the `{approvals.map(...)}` block), and update that following `approvals.map`'s `isLast`-style border logic to also account for `vehiclesDue`:

```tsx
        {vehiclesDue.map((item, i) => {
          const dueLabel = item.daysUntilDue <= 0 ? 'Overdue' : `Due in ${item.daysUntilDue}d`
          const urgency = item.daysUntilDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === vehiclesDue.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`vehicle-${item.kind}-${item.id}`}
              href={`/dashboard/expenses/vehicles/${item.id}`}
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
```

Then update the approvals block's own `isLast`-equivalent border condition (its className ternary) to also check `vehiclesDue.length > 0` where it currently checks `unreadMessages.length > 0 || timedItems.length > 0` — i.e. change:
```tsx
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || unreadMessages.length > 0 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
```
to:
```tsx
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || unreadMessages.length > 0 || timedItems.length > 0 || vehiclesDue.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
```
(This is the same "am I the last row overall" pattern already used throughout this file — `vehiclesDue` renders after `dueBusinessExpenses` but before `approvals`, so `approvals`/`unreadMessages`/`timedItems` need to know vehicle rows exist above `approvals`... actually vehicle rows render *before* approvals in list order per Step 4, so the correction needed is only that vehicle rows' own trailing border accounts for what comes *after* them (approvals/unreadMessages/timedItems), which Step 4's `isLast` already does. The approvals block's condition doesn't need `vehiclesDue` at all since vehiclesDue renders above it, not below — skip this sub-step, Step 4's `isLast` alone is correct and sufficient.)

- [ ] **Step 5: Add `Link` import if not already present**

`DashboardUpcoming.tsx` already imports `Link` from `next/link` (used by the approvals/unread-messages blocks) — no change needed here, just confirming during implementation that the existing import covers the new usage in Step 4.

- [ ] **Step 6: Query and compute `vehiclesDue` in `src/app/dashboard/page.tsx`**

Add to the imports:
```tsx
import type { UpcomingVehicleDue } from '@/components/dashboard/DashboardUpcoming'
import { regoStatus, serviceStatus, REGO_DUE_WINDOW_DAYS, SERVICE_DUE_DATE_WINDOW_DAYS } from '@/lib/vehicles'
import { daysUntil } from '@/lib/expenses'
import type { Vehicle } from '@/types/vehicles'
```
(add `UpcomingVehicleDue` into the existing `import type { UpcomingMeeting, ... } from '@/components/dashboard/DashboardUpcoming'` line rather than a separate import statement)

Add a query for the user's visible vehicles (RLS naturally scopes this — no role branching needed) alongside the other `Promise.all` dashboard queries:
```tsx
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
```

Then, after that query resolves (call the result `vehiclesRes`), compute the due list:
```tsx
  const vehiclesDue: UpcomingVehicleDue[] = []
  for (const v of (vehiclesRes.data ?? []) as Pick<Vehicle, 'id' | 'registration_number' | 'rego_expiry_date' | 'next_service_due_date' | 'next_service_due_km' | 'current_odometer_km'>[]) {
    const rego = regoStatus(v)
    if (rego !== 'ok' && v.rego_expiry_date) {
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'rego', daysUntilDue: daysUntil(v.rego_expiry_date) })
    }
    const service = serviceStatus(v)
    if (service !== 'ok' && v.next_service_due_date) {
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'service', daysUntilDue: daysUntil(v.next_service_due_date) })
    } else if (service !== 'ok' && v.next_service_due_km != null && v.current_odometer_km != null) {
      // km-only due trigger (no date set) — daysUntilDue isn't meaningful here, show as due now.
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'service', daysUntilDue: 0 })
    }
  }
```

(This mirrors `regoStatus`/`serviceStatus`'s exact due-window logic from `@/lib/vehicles` — Task 2 — rather than re-deriving thresholds inline, so the dashboard badge and the vehicle detail page's badge can never disagree with each other. `REGO_DUE_WINDOW_DAYS`/`SERVICE_DUE_DATE_WINDOW_DAYS` are imported but not directly referenced in this snippet — they're used inside `regoStatus`/`serviceStatus` themselves; the import is here so the exact plan-review "type consistency" pass has this task's full dependency list visible.)

Finally, pass it to `DashboardUpcoming`:
```tsx
        <DashboardUpcoming
          meetings={meetings}
          events={events}
          sessions={sessions}
          tasks={tasks}
          approvals={approvals}
          unreadMessages={unreadMessages}
          dueExpenses={dueExpenses}
          dueBusinessExpenses={dueBusinessExpenses}
          vehiclesDue={vehiclesDue}
          currentUserId={user.id}
        />
```
(Match this against the actual existing `<DashboardUpcoming ... />` call site in `page.tsx` — add the `vehiclesDue={vehiclesDue}` prop to whatever props it already passes; the exact surrounding prop list depends on reading the file's current state, since this plan was written against the design spec, not a fresh read of every existing prop on that call.)

- [ ] **Step 7: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx
git commit -m "handover: C-5 vehicle registration/service due items on dashboard Today"
```

---

## Manual verification (no test runner)

After all 5 tasks land and `pnpm run build` passes clean end-to-end, this needs an authenticated browser session the conductor doesn't have — same precedent as every prior phase (per `.handover/decisions.md`). The user should walk through:

1. **As owner/admin:** Create a vehicle on the Expenses page, assign it to a team member, confirm it appears with correct rego/service badges.
2. **As the assigned employee:** Confirm they see only their own vehicle (not the full fleet) in their Expenses page's Vehicles section; log an odometer reading; log a vehicle expense; confirm they cannot see an edit/reassign control.
3. **Approve that vehicle expense as admin/owner**, then confirm it shows up in the Finance page's category pie chart (already wired — no code change needed there, per the earlier "Payroll pie chart" investigation this same session).
4. **Crew isolation:** as a manager who does *not* manage the assignee's crew, confirm the vehicle 404s; as the manager who *does*, confirm full access.
5. **Dashboard Today:** set a vehicle's rego/service due date within 30 days (or km within 500 of the threshold), confirm it shows up on `/dashboard` for whoever can see that vehicle, and disappears once pushed out past the window.
