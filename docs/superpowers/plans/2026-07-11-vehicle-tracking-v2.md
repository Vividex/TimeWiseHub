# Vehicle Tracking v2 Implementation Plan

> **For agentic workers:** This project uses the handover loop (Claude=conductor, Codex=implementer via `.handover/`), not `subagent-driven-development`/`executing-plans`. See `.handover/spec.md` for the turn-by-turn checklist derived from this plan.

**Goal:** Three follow-ups to the shipped Vehicle Tracking feature (append-only notes log, standalone `/dashboard/vehicles` nav page, paid rego-lookup that auto-fills make/model/year/expiry), plus two small research-backed polish items: required receipts on vehicle expenses and optional driver attribution on odometer readings for shared vehicles.

**Architecture:** One additive/destructive DB migration (new `vehicle_notes` table mirroring the existing `vehicle_odometer_logs` pattern, new `vehicles.state` column, drop the old single-text `vehicles.notes` column). A route move (`/dashboard/expenses/vehicles/[id]` → `/dashboard/vehicles/[id]`, new `/dashboard/vehicles` list page). One new server-side API route (`POST /api/vehicles/lookup-rego`) holding a new paid third-party API key.

**Tech Stack:** Next.js App Router, Supabase (Postgres RLS, reuses the existing `can_access_vehicle()` function), Tailwind, `lucide-react`. No new npm dependencies. One new external paid API (CarRegistrationAPI.com / regcheck.org.uk, ~$0.30 AUD/lookup, purchased in blocks of ≥100).

## Global Constraints
- No test runner — verification is `pnpm run build` (tsc + eslint) after every task, plus manual smoke testing.
- Codex handles text edits only; the conductor runs all shell/git commands, file moves, and the DB migration via Supabase MCP.
- The rego-lookup button is the *only* thing that can trigger a paid API call — no auto-search-as-you-type anywhere (confirmed in the design).
- Notes are append-only, mirroring the existing `vehicle_odometer_logs` pattern exactly — no update/delete policy.

## Important caveat on Task 4 (rego lookup)

The exact request/response field names for CarRegistrationAPI.com's AU service could not be fully confirmed — their public site only exposes a partial PDF doc, and the underlying broker (regcheck.org.uk) is a UK-origin SOAP/JSON service white-labelled for AU. Task 4's route code uses the well-documented public `regcheck.org.uk` JSON pattern (`GET /api/json.aspx?RegistrationNumber=...&username=...`) and parses the response defensively (checks several likely field-name variants), but **this must be verified against the real documentation once the user has signed up for real API credentials** — the account signup gives access to the full PDF and support contact (`info@carregistrationapi.com`). This is real, working best-effort code, not a stub — but it is the one piece of this plan with residual uncertainty, flagged explicitly rather than silently assumed correct.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-099-vehicle-notes-and-rego-lookup.sql`

**Interfaces:**
- Produces: table `vehicle_notes` (id, vehicle_id, note, created_by, created_at); column `vehicles.state`; removes column `vehicles.notes`.

Conductor-only — Codex does not touch this.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 099: Vehicle notes log, rego-lookup state column
-- Adds an append-only notes log for vehicles (mirrors
-- vehicle_odometer_logs exactly — same can_access_vehicle() RLS gate,
-- no update/delete policy). Adds vehicles.state (AU state/territory,
-- needed for the rego-lookup API) and drops the old single-text
-- vehicles.notes column — no real vehicle data exists in production
-- yet, so this is a clean removal, not a migration.
-- Run via Supabase MCP apply_migration (name: vehicle_notes_and_rego_lookup)
-- ============================================================

create table public.vehicle_notes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index vehicle_notes_vehicle_id_idx on public.vehicle_notes(vehicle_id);

alter table public.vehicle_notes enable row level security;

create policy "Users can view notes for accessible vehicles"
  on public.vehicle_notes for select
  using (
    exists (
      select 1 from vehicles v
      where v.id = vehicle_notes.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

create policy "Users can add notes for accessible vehicles"
  on public.vehicle_notes for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from vehicles v
      where v.id = vehicle_notes.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

alter table public.vehicles add column state text;
alter table public.vehicles drop column notes;
```

- [ ] **Step 2: Apply via Supabase MCP**

Conductor runs `apply_migration` (project id `sdwwlnnsijcadkdwsvud`, name `vehicle_notes_and_rego_lookup`) with the SQL above.

- [ ] **Step 3: Verify**

Run `list_migrations` (confirm it appears) and:
```sql
select column_name from information_schema.columns where table_name = 'vehicles' and column_name in ('state', 'notes');
```
Expected: one row (`state`), `notes` gone.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-099-vehicle-notes-and-rego-lookup.sql
git commit -m "handover: C-1 vehicle notes table + state column + drop old notes column"
```

---

### Task 2: Standalone `/dashboard/vehicles` nav page

**Files:**
- Move: `src/app/dashboard/expenses/vehicles/[id]/page.tsx` → `src/app/dashboard/vehicles/[id]/page.tsx` (conductor does the physical move — see Step 1 — no content change needed, this file has no hardcoded `/dashboard/expenses` paths)
- Create: `src/app/dashboard/vehicles/page.tsx`
- Modify: `src/app/dashboard/expenses/page.tsx`
- Modify: `src/components/nav/SidebarNav.tsx`
- Modify: `src/components/vehicles/VehiclesView.tsx`
- Modify: `src/components/vehicles/VehicleDetailClient.tsx`

**Interfaces:**
- No new types/functions — this task is purely route relocation + link updates.

- [ ] **Step 1 (conductor, before dispatching to Codex): move the directory**

```bash
git mv "src/app/dashboard/expenses/vehicles" "src/app/dashboard/vehicles"
```

This preserves git history as a rename. The moved `[id]/page.tsx` needs no content
changes — verify by reading it after the move; it only imports `VehicleDetailClient`
and fetches by `params.id`, nothing path-specific.

- [ ] **Step 2: Create `src/app/dashboard/vehicles/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VehiclesView, { type OrgMemberOption } from '@/components/vehicles/VehiclesView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { Vehicle } from '@/types/vehicles'

export default async function VehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membership }, subscription] = await Promise.all([
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const orgId = membership?.org_id ?? null
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const canSeeVehicles = Boolean(orgId && isTeamPlan(subscription))

  if (!canSeeVehicles || !orgId) redirect('/dashboard')

  const [{ data: vehicles }, { data: members }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_archived', false)
      .order('registration_number'),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId),
  ])

  const vehicleList = (vehicles ?? []) as Vehicle[]
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
        <VehiclesView vehicles={vehicleList} orgId={orgId} members={memberOptions} canManage={isManager} />
      </div>
    </div>
  )
}
```

Note: unlike the old embedded version, this dedicated page always renders
`VehiclesView` once `canSeeVehicles` is true (no `showVehicles` empty-hiding logic) —
`VehiclesView` already renders its own "No vehicles found." empty state, which is the
right behaviour for a page reached by an explicit nav click, not an optional card
among several on a shared page. Non-team-plan users are redirected to `/dashboard`
before rendering anything, matching how the feature was gated before (silently
absent), consistent with how other team-only nav destinations in this codebase are
gated at the page level, not by hiding the nav link itself.

- [ ] **Step 3: Replace `src/app/dashboard/expenses/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ManagerExpenseView from '@/components/expenses/ManagerExpenseView'
import BusinessExpensesView from '@/components/expenses/BusinessExpensesView'
import SubscriptionsView from '@/components/expenses/SubscriptionsView'
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

  let vehicleList: Vehicle[] = []
  if (isManager && membership?.org_id) {
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', membership.org_id)
      .eq('is_archived', false)
      .order('registration_number')
    vehicleList = (vehicles ?? []) as Vehicle[]
  }

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl space-y-6">
        <ExpenseForm categories={categories ?? []} userId={user.id} orgId={membership?.org_id ?? null} />
        <SubscriptionsView userId={user.id} orgId={membership?.org_id ?? null} categories={categories ?? []} />
        <ExpenseList initialExpenses={expenses ?? []} categories={categories ?? []} userId={user.id} />
        {isManager && membership?.org_id && (
          <BusinessExpensesView userId={user.id} orgId={membership.org_id} categories={categories ?? []} canApprove={isAdminOrOwner} vehicles={vehicleList} />
        )}
        {isManager && membership?.org_id && <ManagerExpenseView orgId={membership.org_id} />}
      </div>
    </div>
  )
}
```

This removes the `VehiclesView` import/render and the `memberOptions`/
`OrgMemberOption` fetch entirely (no longer needed here) — `vehicleList` is kept,
scoped to manager-only, since `BusinessExpensesView`'s vehicle-tagging dropdown still
needs it.

- [ ] **Step 4: Add the nav item to `src/components/nav/SidebarNav.tsx`**

Add `Car` to the existing lucide-react import line:
```tsx
import {
  LayoutDashboard, Clock, CalendarDays, CalendarClock, Palmtree, Receipt, Users, FileText,
  TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
  MessageSquare, Sparkles, CalendarRange, Users2, Video, ScrollText, Network, Library, BookOpen, GraduationCap, Car, type LucideIcon,
} from 'lucide-react'
```

Append a new item to the end of the `'Money'` group's `items` array:
```tsx
  { title: 'Money', items: [
    { label: 'Quotes', href: '/dashboard/quotes', icon: ScrollText },
    { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
    { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
    { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
    { label: 'Vehicles', href: '/dashboard/vehicles', icon: Car },
  ] },
```

- [ ] **Step 5: Modify `src/components/vehicles/VehiclesView.tsx`**

Read the file first (it's the same content as when it was created for the original
vehicle-tracking phase — one Codex turn re-implemented it from memory rather than the
plan's exact draft, but the structure is stable). Find the vehicle-card `Link`:
```tsx
              <Link
                key={vehicle.id}
                href={`/dashboard/expenses/vehicles/${vehicle.id}`}
```
Change the `href` to:
```tsx
              <Link
                key={vehicle.id}
                href={`/dashboard/vehicles/${vehicle.id}`}
```
No other change to this file in this task.

- [ ] **Step 6: Modify `src/components/vehicles/VehicleDetailClient.tsx`**

Read the file first. Find:
```tsx
      <Link href="/dashboard/expenses" className="text-sm font-bold text-cyan-600 hover:underline dark:text-cyan-400">
        Back to expenses
      </Link>
```
Change to:
```tsx
      <Link href="/dashboard/vehicles" className="text-sm font-bold text-cyan-600 hover:underline dark:text-cyan-400">
        Back to vehicles
      </Link>
```
No other change to this file in this task (Notes and the rego-lookup Refresh button
are separate tasks below, on this same file).

- [ ] **Step 7: Build**

Run: `pnpm run build` — must pass clean; confirm `/dashboard/vehicles` and
`/dashboard/vehicles/[id]` appear in the route table, and
`/dashboard/expenses/vehicles/[id]` no longer does.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/vehicles src/app/dashboard/expenses/page.tsx src/components/nav/SidebarNav.tsx src/components/vehicles/VehiclesView.tsx src/components/vehicles/VehicleDetailClient.tsx
git commit -m "handover: C-2 move Vehicles to its own nav page"
```

---

### Task 3: Vehicle notes log

**Files:**
- Modify: `src/app/dashboard/vehicles/[id]/page.tsx`
- Modify: `src/components/vehicles/VehicleDetailClient.tsx`

**Interfaces:**
- Consumes: table `vehicle_notes` (Task 1).
- Produces: `VehicleDetailClient` accepts a new `notes: VehicleNote[]` prop; exports a new `VehicleNote` type; `Vehicle` type gains `state: string | null`, loses `notes: string | null`.

**Important — a real naming collision to resolve in this task.** The already-shipped
`VehicleDetailClient.tsx` has its own `const [notes, setNotes] = useState(vehicle.notes ?? '')`
bound to the *old* single-text `vehicles.notes` column — used in a `<textarea>` inside
the servicing/rego edit form, a read-only `<dd>{vehicle.notes}</dd>` display, and
included in `saveVehicleDetails`'s update payload (`notes: notes.trim() || null`).
Task 1 drops that column. This task must **remove all of that old code first**, before
adding the new notes-log state (also naturally named `notes`/`setNotes` for the list)
— otherwise there are two conflicting `useState` declarations with the same name.

- [ ] **Step 0: Update `src/types/vehicles.ts`**

Change the `Vehicle` type: remove the `notes: string | null` line, add
`state: string | null`:
```ts
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
  state: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}
```
(`VehicleOdometerLog` is unchanged — leave it as-is.)

- [ ] **Step 1: Modify `src/app/dashboard/vehicles/[id]/page.tsx`**

Read the file first (it was just moved in Task 2, content unchanged from the original
shipped version). Find the existing fetch block:
```tsx
  const [
    { data: odometerLogs },
    { data: linkedExpenses },
    { data: membership },
    { data: members },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('vehicle_odometer_logs')
      .select('*')
      .eq('vehicle_id', currentVehicle.id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, org_id, user_id, category_id, amount, currency, description, expense_date, receipt_path, status, expense_categories(name)')
      .eq('vehicle_id', currentVehicle.id)
      .eq('is_business', true)
      .order('expense_date', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('role, org_id')
      .eq('org_id', currentVehicle.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentVehicle.org_id),
    supabase
      .from('expense_categories')
      .select('id, name')
      .order('name'),
  ])
```
Replace it with (adds `{ data: vehicleNotes }` as a 6th destructured result and a 6th
query):
```tsx
  const [
    { data: odometerLogs },
    { data: linkedExpenses },
    { data: membership },
    { data: members },
    { data: categories },
    { data: vehicleNotes },
  ] = await Promise.all([
    supabase
      .from('vehicle_odometer_logs')
      .select('*')
      .eq('vehicle_id', currentVehicle.id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, org_id, user_id, category_id, amount, currency, description, expense_date, receipt_path, status, expense_categories(name)')
      .eq('vehicle_id', currentVehicle.id)
      .eq('is_business', true)
      .order('expense_date', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('role, org_id')
      .eq('org_id', currentVehicle.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentVehicle.org_id),
    supabase
      .from('expense_categories')
      .select('id, name')
      .order('name'),
    supabase
      .from('vehicle_notes')
      .select('*')
      .eq('vehicle_id', currentVehicle.id)
      .order('created_at', { ascending: false }),
  ])
```
Import `VehicleNote` alongside the other types already imported from
`VehicleDetailClient` in this file:
```tsx
import VehicleDetailClient, {
  type ExpenseCategoryOption,
  type OrgMemberOption,
  type VehicleExpense,
  type VehicleNote,
} from '@/components/vehicles/VehicleDetailClient'
```
Add the new prop to the `<VehicleDetailClient ... />` call, alongside the other props:
```tsx
      odometerLogs={(odometerLogs ?? []) as VehicleOdometerLog[]}
      notes={(vehicleNotes ?? []) as VehicleNote[]}
```

- [ ] **Step 2: Modify `src/components/vehicles/VehicleDetailClient.tsx`**

Read the file first (Task 2 already changed the back-link in this file — build on
that current state, not the original).

**First, remove the old single-text notes code** (see the "naming collision" note
above — this must happen before adding the new notes-log state):
- Remove `const [notes, setNotes] = useState(vehicle.notes ?? '')` (it's declared
  alongside `nextServiceDueDate`/`nextServiceDueKm`/`regoExpiryDate`).
- In `saveVehicleDetails`, remove `notes: notes.trim() || null,` from the `updates`
  object, and remove `notes` from the `setVehicle(prev => ({ ...prev, ...updates }))`
  call's implicit spread (no code change needed there — `updates` no longer has a
  `notes` key once the line above is removed, so the spread is already correct).
- Remove the `<textarea value={notes} onChange={...} rows={4} .../>` block and its
  `<label>Notes</label>` from the `canEdit` form.
- Remove the read-only notes `<div>` block from the `!canEdit` `<dl>` (the one
  wrapping `<dt>Notes</dt><dd>{vehicle.notes}</dd>`, guarded by
  `{vehicle.notes && (...)}`).

**Then add the new notes-log code.** A new exported type near the other exported
types (`OrgMemberOption`, `ExpenseCategoryOption`, `VehicleExpense`):
```tsx
export type VehicleNote = {
  id: string
  note: string
  created_by: string | null
  created_at: string
}
```

Add `notes` to the component's props (both the destructuring and the type):
```tsx
export default function VehicleDetailClient({
  vehicle: initialVehicle,
  odometerLogs: initialOdometerLogs,
  notes: initialNotes,
  expenses,
  members,
  categories,
  userId,
  canEdit,
  canDelete,
  canLog,
}: {
  vehicle: Vehicle
  odometerLogs: VehicleOdometerLog[]
  notes: VehicleNote[]
  expenses: VehicleExpense[]
  members: OrgMemberOption[]
  categories: ExpenseCategoryOption[]
  userId: string
  canEdit: boolean
  canDelete: boolean
  canLog: boolean
}) {
```

Add local state for notes and the add-note form, alongside the existing
`odometerLogs`/odometer-form state:
```tsx
  const [notes, setNotes] = useState(initialNotes)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
```

Add a handler alongside `logOdometer`:
```tsx
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canLog) return

    setSavingNote(true)
    setNoteError(null)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('vehicle_notes')
      .insert({ vehicle_id: vehicle.id, note: noteText.trim(), created_by: userId })
      .select()
      .single()

    if (error) {
      setNoteError(error.message)
      setSavingNote(false)
      return
    }

    setNotes(prev => [data as VehicleNote, ...prev])
    setNoteText('')
    setSavingNote(false)
    router.refresh()
  }
```

Add a helper to resolve a note's author name from the existing `members` prop (same
pattern as the existing `assignedMember` lookup):
```tsx
  function authorName(userId: string | null) {
    if (!userId) return 'Unknown'
    return members.find(member => member.user_id === userId)?.name ?? 'Unknown'
  }
```

Add a new "Notes" section, positioned after the "Odometer log" card (the
`grid grid-cols-1 gap-6 lg:grid-cols-2` block containing "Servicing and registration"
and "Odometer log") and before the "Linked expenses" card:
```tsx
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <NotebookText size={18} className="text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notes</h2>
        </div>

        {canLog && (
          <form onSubmit={addNote} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Add a note</label>
              <textarea required value={noteText} onChange={event => setNoteText(event.target.value)} rows={3}
                placeholder="Anything worth remembering about this vehicle…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            {noteError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{noteError}</p>}
            <button type="submit" disabled={savingNote} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {savingNote ? 'Saving...' : 'Add note'}
            </button>
          </form>
        )}

        {notes.length === 0 ? (
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map(note => (
              <li key={note.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-200">{note.note}</p>
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
                  {authorName(note.created_by)} — {displayDate(note.created_at.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
```

Add `NotebookText` to the existing lucide-react import line:
```tsx
import { Archive, Car, Gauge, NotebookText, ReceiptText, Wrench } from 'lucide-react'
```

- [ ] **Step 3: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/vehicles/[id]/page.tsx src/components/vehicles/VehicleDetailClient.tsx
git commit -m "handover: C-3 append-only vehicle notes log"
```

---

### Task 4: Rego lookup

**Files:**
- Create: `src/app/api/vehicles/lookup-rego/route.ts`
- Modify: `src/components/vehicles/VehiclesView.tsx`
- Modify: `src/components/vehicles/VehicleDetailClient.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `POST /api/vehicles/lookup-rego`, request body `{ registrationNumber: string, state: string }`, response `{ make: string | null, model: string | null, year: number | null, regoExpiryDate: string | null }` on success (200) or `{ error: string }` on failure (4xx/5xx).

- [ ] **Step 1: Create the API route**

```ts
// src/app/api/vehicles/lookup-rego/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const AU_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'ACT', 'NT', 'WA', 'TAS'])

type LookupResult = {
  make: string | null
  model: string | null
  year: number | null
  regoExpiryDate: string | null
}

/**
 * Field names below are a best-effort match against regcheck.org.uk's public JSON
 * pattern (the underlying broker behind CarRegistrationAPI.com's AU service) —
 * verify against the real docs once real credentials exist (info@carregistrationapi.com),
 * see the plan doc's "Important caveat on Task 4" note. Parsed defensively so a field
 * being named slightly differently doesn't crash the route, just returns nulls for
 * that field.
 */
function parseLookupResponse(raw: unknown): LookupResult {
  const data = (raw ?? {}) as Record<string, unknown>

  function textField(...keys: string[]): string | null {
    for (const key of keys) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (value && typeof value === 'object' && 'CurrentTextValue' in value) {
        const nested = (value as { CurrentTextValue?: unknown }).CurrentTextValue
        if (typeof nested === 'string' && nested.trim()) return nested.trim()
      }
    }
    return null
  }

  const yearText = textField('RegistrationYear', 'Year', 'year')
  const year = yearText ? parseInt(yearText, 10) : null

  return {
    make: textField('CarMake', 'Make', 'make'),
    model: textField('CarModel', 'Model', 'model'),
    year: Number.isFinite(year) ? year : null,
    regoExpiryDate: textField('RegistrationExpiry', 'ExpiryDate', 'expiryDate') ?? null,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { registrationNumber?: string; state?: string } | null
  const registrationNumber = body?.registrationNumber?.trim().toUpperCase()
  const state = body?.state?.trim().toUpperCase()

  if (!registrationNumber || !state || !AU_STATES.has(state)) {
    return NextResponse.json({ error: 'A registration number and a valid Australian state are required.' }, { status: 400 })
  }

  const apiKey = process.env.CAR_REGO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Rego lookup is not configured yet.' }, { status: 503 })
  }

  const url = new URL('https://www.regcheck.org.uk/api/json.aspx')
  url.searchParams.set('RegistrationNumber', registrationNumber)
  url.searchParams.set('username', apiKey)

  let response: Response
  try {
    response = await fetch(url.toString())
  } catch {
    return NextResponse.json({ error: 'Could not reach the rego lookup service.' }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Rego lookup failed (${response.status}).` }, { status: 502 })
  }

  const raw = await response.json().catch(() => null)
  if (!raw) {
    return NextResponse.json({ error: 'Rego lookup returned an unreadable response.' }, { status: 502 })
  }

  const result = parseLookupResponse(raw)
  if (!result.make && !result.model && !result.regoExpiryDate) {
    return NextResponse.json({ error: 'No details found for that registration number.' }, { status: 404 })
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Add the env var name to `.env.example`**

Add a new section near the other paid-API sections:
```
# --- Vehicle rego lookup (CarRegistrationAPI.com) ---
CAR_REGO_API_KEY=                   # ~$0.30 AUD/lookup, purchased in blocks of >=100
                                    # at carregistrationapi.com. Server-only.
```

- [ ] **Step 3: Modify `src/components/vehicles/VehiclesView.tsx`**

Read the file first (Step 5 of Task 2 already changed the vehicle-card `Link` href in
this file — build on that current state). Add `useTextFilter`'s neighbours: new
imports:
```tsx
import { useState } from 'react'
```
(already imported — no change needed to this specific line, just confirming it's
already there before adding new `useState` calls below.)

Add new state for the state-selector and lookup, alongside the existing
`rego`/`year`/`make`/`model`/`assignedUserId` state:
```tsx
  const [state, setState] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [regoExpiryDate, setRegoExpiryDate] = useState('')
```

Add `AU_STATES` as a module-level constant (top of file, alongside the component):
```tsx
const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'ACT', 'NT', 'WA', 'TAS']
```

Add a lookup handler, alongside `handleSubmit`:
```tsx
  async function lookupRego() {
    if (!rego.trim() || !state) return
    setLookingUp(true)
    setLookupError(null)

    const res = await fetch('/api/vehicles/lookup-rego', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: rego, state }),
    })
    const json = await res.json()

    setLookingUp(false)
    if (!res.ok) { setLookupError(json.error ?? 'Lookup failed.'); return }

    if (json.make) setMake(json.make)
    if (json.model) setModel(json.model)
    if (json.year) setYear(String(json.year))
    if (json.regoExpiryDate) setRegoExpiryDate(json.regoExpiryDate)
  }
```

Update `resetForm` to also clear the new fields:
```tsx
  function resetForm() {
    setRego(''); setYear(''); setMake(''); setModel(''); setAssignedUserId('')
    setState(''); setRegoExpiryDate(''); setLookupError(null); setError(null)
  }
```

Update `handleSubmit`'s insert payload to include `state` and `rego_expiry_date`:
```tsx
    const { error: insertError } = await supabase.from('vehicles').insert({
      org_id: orgId,
      registration_number: rego.trim().toUpperCase(),
      year: year ? parseInt(year, 10) : null,
      make: make.trim() || null,
      model: model.trim() || null,
      assigned_user_id: assignedUserId || null,
      state: state || null,
      rego_expiry_date: regoExpiryDate || null,
    })
```

Add the state selector + Look up button next to the Registration field — find the
existing Registration/Year grid:
```tsx
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
```
Replace it with:
```tsx
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Registration *</label>
              <input required value={rego} onChange={e => setRego(e.target.value)} placeholder="ABC123"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">State</label>
              <select value={state} onChange={e => setState(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="">Select state</option>
                {AU_STATES.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={lookupRego} disabled={lookingUp || !rego.trim() || !state}
                className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition-colors hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
                {lookingUp ? 'Looking up…' : 'Look up'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</label>
              <input type="date" value={regoExpiryDate} onChange={e => setRegoExpiryDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          {lookupError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">{lookupError}</p>}
```

(The Year field moves out of that first grid — add it to the existing Make/Model grid
instead, changing it from `sm:grid-cols-2` to `sm:grid-cols-3`:)
```tsx
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Year</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2022"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
```
(this replaces the original standalone Make/Model `sm:grid-cols-2` block — Year now
lives here instead of next to Registration, since Registration's row now holds
Registration/State/Look-up.)

- [ ] **Step 4: Modify `src/components/vehicles/VehicleDetailClient.tsx`**

Read the file first (Task 3 already added the Notes section to this file — build on
that current state). Add lookup state alongside the existing servicing/rego edit-form
state (`nextServiceDueDate`, `nextServiceDueKm`, `regoExpiryDate`, `notes` — note:
Task 3 already introduced a `notes` state variable for the notes log; the state added
here is unrelated and must use different names, e.g. `refreshingRego`/`refreshError`):
```tsx
  const [refreshingRego, setRefreshingRego] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
```

Add a handler alongside `saveVehicleDetails`:
```tsx
  async function refreshRegoDetails() {
    if (!vehicle.state) {
      setRefreshError('Set a state on this vehicle before refreshing rego details.')
      return
    }
    setRefreshingRego(true)
    setRefreshError(null)

    const res = await fetch('/api/vehicles/lookup-rego', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: vehicle.registration_number, state: vehicle.state }),
    })
    const json = await res.json()

    setRefreshingRego(false)
    if (!res.ok) { setRefreshError(json.error ?? 'Lookup failed.'); return }

    if (json.regoExpiryDate) setRegoExpiryDate(json.regoExpiryDate)
  }
```

(Only `regoExpiryDate` is set from the response — the lookup API never returns
servicing-schedule data, only rego/vehicle details, so `nextServiceDueKm`/
`nextServiceDueDate` are untouched by this handler.)

Add a "Refresh rego details" button next to the existing "Rego expiry" field inside
the `canEdit` form (find the `<label>Rego expiry</label>` block inside
`saveVehicleDetails`'s form and add a button below its `<input>`):
```tsx
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</label>
                  <input type="date" value={regoExpiryDate} onChange={event => setRegoExpiryDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <button type="button" onClick={refreshRegoDetails} disabled={refreshingRego}
                    className="mt-1.5 text-xs font-semibold text-cyan-600 hover:underline disabled:opacity-50 dark:text-cyan-400">
                    {refreshingRego ? 'Refreshing…' : 'Refresh rego details'}
                  </button>
                  {refreshError && <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">{refreshError}</p>}
                </div>
```

- [ ] **Step 5: Build**

Run: `pnpm run build` — must pass clean; confirm `/api/vehicles/lookup-rego` appears
in the route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/vehicles/lookup-rego src/components/vehicles/VehiclesView.tsx src/components/vehicles/VehicleDetailClient.tsx .env.example
git commit -m "handover: C-4 rego lookup (CarRegistrationAPI) for auto-filling vehicle details"
```

---

### Task 5: Professionalization polish — required receipts, optional driver attribution

Added after researching how established fleet-management products handle vehicle
expense approval and shared vehicles (see the design spec's §4) — two small,
narrowly-scoped additions, not a redesign.

**Files:**
- Create: `supabase/schema-100-vehicle-odometer-driven-by.sql`
- Modify: `src/components/vehicles/VehicleDetailClient.tsx`

**Interfaces:**
- Consumes: `log_vehicle_odometer()` RPC (Task 1 of the original vehicle-tracking
  plan) — gains a new optional parameter, existing call signature still works.
- Produces: `vehicle_odometer_logs.driven_by` column; `VehicleOdometerLog` type gains
  `driven_by: string | null`.

- [ ] **Step 1 (conductor): write and apply the migration**

```sql
-- ============================================================
-- TimeWiseHub — Schema 100: Optional driver attribution on odometer logs
-- Some vehicles are shared by more than one person. Rather than a
-- reservation/booking system (real fleet products keep that as a
-- separate module for much larger fleets than this business has),
-- this is a single optional field: who was actually driving the day
-- an odometer reading was logged, separate from the vehicle's current
-- assigned owner. Deliberately NOT added to `expenses` — that table's
-- user_id already means "who submitted this," which can legitimately
-- differ from who was driving; overloading it would pollute a shared
-- table's semantics for every other expense type app-wide.
-- Run via Supabase MCP apply_migration (name: vehicle_odometer_driven_by)
-- ============================================================

alter table public.vehicle_odometer_logs add column driven_by uuid references auth.users(id);

-- Backward-compatible: appends a new defaulted parameter, existing callers that omit
-- it keep working unmodified.
create or replace function public.log_vehicle_odometer(
  p_vehicle_id uuid,
  p_odometer_km integer,
  p_notes text default null,
  p_driven_by uuid default null
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

  insert into vehicle_odometer_logs (vehicle_id, odometer_km, logged_by, notes, driven_by)
  values (p_vehicle_id, p_odometer_km, auth.uid(), p_notes, p_driven_by)
  returning * into v_log;

  update vehicles set current_odometer_km = p_odometer_km where id = p_vehicle_id;

  return v_log;
end;
$$;
```

Apply via Supabase MCP `apply_migration` (name: `vehicle_odometer_driven_by`).
Verify: `list_migrations` shows it, and
```sql
select column_name from information_schema.columns where table_name = 'vehicle_odometer_logs' and column_name = 'driven_by';
```
returns one row.

Commit:
```bash
git add supabase/schema-100-vehicle-odometer-driven-by.sql
git commit -m "handover: C-5a optional driven_by column on odometer log RPC"
```

- [ ] **Step 2: Modify `src/types/vehicles.ts`**

Add `driven_by: string | null` to the `VehicleOdometerLog` type:
```ts
export type VehicleOdometerLog = {
  id: string
  vehicle_id: string
  odometer_km: number
  logged_at: string
  logged_by: string | null
  notes: string | null
  driven_by: string | null
  created_at: string
}
```

- [ ] **Step 3: Modify `src/components/vehicles/VehicleDetailClient.tsx`**

Read the file first (Tasks 2-4 have already modified this file — build on that
current state). Two independent changes:

**(a) Required receipt.** Find the "Log vehicle expense" form's receipt input:
```tsx
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Receipt (optional)</label>
              <input type="file" accept="image/*,.pdf" onChange={event => setExpenseReceipt(event.target.files?.[0] ?? null)}
                className="w-full text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-600 hover:file:bg-cyan-100" />
```
Change to (drops "(optional)" from the label, adds `required`):
```tsx
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Receipt *</label>
              <input required type="file" accept="image/*,.pdf" onChange={event => setExpenseReceipt(event.target.files?.[0] ?? null)}
                className="w-full text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-600 hover:file:bg-cyan-100" />
```

**(b) Optional driver attribution on the odometer form.** Add state alongside the
existing `odometerKm`/`odometerNotes` state:
```tsx
  const [drivenBy, setDrivenBy] = useState('')
```
In `logOdometer`, add `p_driven_by: drivenBy || null` to the RPC call:
```tsx
    const { data, error } = await supabase.rpc('log_vehicle_odometer', {
      p_vehicle_id: vehicle.id,
      p_odometer_km: parseInt(odometerKm, 10),
      p_notes: odometerNotes.trim() || null,
      p_driven_by: drivenBy || null,
    })
```
Reset it alongside the other odometer-form fields after a successful submit (find
`setOdometerKm(''); setOdometerNotes('')` — actually these are two separate
statements in the existing code; add the reset right after them):
```tsx
    setOdometerKm('')
    setOdometerNotes('')
    setDrivenBy('')
```
Add a "Driven by" select to the odometer quick-add form, right after the existing
Notes field:
```tsx
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Driven by (optional)</label>
                <select value={drivenBy} onChange={event => setDrivenBy(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Not recorded</option>
                  {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
                </select>
              </div>
```
In the odometer log list, show the driver when set — find the log list item:
```tsx
                <li key={log.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{log.odometer_km.toLocaleString()} km</p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">{displayDate(log.logged_at)}</p>
                  {log.notes && <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{log.notes}</p>}
                </li>
```
Change to (reuses the existing `authorName` helper added in Task 3):
```tsx
                <li key={log.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{log.odometer_km.toLocaleString()} km</p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                    {displayDate(log.logged_at)}{log.driven_by ? ` — driven by ${authorName(log.driven_by)}` : ''}
                  </p>
                  {log.notes && <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{log.notes}</p>}
                </li>
```

- [ ] **Step 4: Build**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 5: Commit**

```bash
git add src/types/vehicles.ts src/components/vehicles/VehicleDetailClient.tsx
git commit -m "handover: C-5b required vehicle-expense receipts + optional driven-by on odometer log"
```

---

## Manual verification (no test runner)

1. As owner/admin: navigate via the sidebar's new "Vehicles" link, confirm the old
   Expenses page no longer shows a Vehicles section.
2. Add a vehicle: pick a state, type a rego, click Look up — with `CAR_REGO_API_KEY`
   not yet set in this environment, expect the "not configured yet" error and confirm
   the form is still fully fillable manually and saves correctly.
3. Once the user has signed up and added `CAR_REGO_API_KEY` to Vercel: repeat the
   lookup with a real rego, confirm make/model/year/expiry populate, and verify the
   returned field names actually matched (adjust `parseLookupResponse` if the real
   response shape differs from the best-effort guess — this is the one open item
   flagged at the top of this plan).
4. Add a note on a vehicle, confirm it appears with the correct author name and
   timestamp; confirm an assigned employee (non-manager) can add a note to their own
   vehicle but not edit/delete existing ones (no such control exists in the UI).
5. On an existing vehicle with a state set, click "Refresh rego details", confirm it
   re-fills the edit form (not a silent save) and "Save vehicle details" still commits
   it.
6. Try submitting the "Log vehicle expense" form with no file attached — confirm the
   browser blocks submission (native `required` validation) rather than it silently
   saving without a receipt.
7. Log an odometer reading with a "Driven by" person selected, confirm the log list
   shows "— driven by <name>"; log another reading with it left blank, confirm no
   driven-by text appears for that row.
