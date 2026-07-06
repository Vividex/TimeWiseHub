# Dashboard: Overdue Invoices Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Overdue invoices" card to the dashboard metrics row, computing overdue status at
read time (the stored `invoice_status` enum's `'overdue'` value is never actually written anywhere
in the codebase today).

**Architecture:** One new pure helper (`isOverdue`) used in two existing pages — the dashboard
(new card) and the invoices list (new `?overdue=1` filter). No schema change, no new table, no cron.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Supabase
(`@supabase/ssr`), Tailwind v4, lucide-react icons.

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean after every task
  — no test runner in this project.
- Package manager: pnpm.
- Windows dev machine; shell is PowerShell (Bash tool also available).
- Supabase queries in this codebase are not strictly schema-typed (no generated `Database` type) —
  `as unknown as { ... }` casts are the established pattern for single-row foreign-key joins.
- `en-AU` locale and `'en-AU'` toLocaleString/toLocaleDateString calls are the established
  convention for any date/currency formatting (avoids hydration mismatches, matches existing code).
- Source spec: `docs/superpowers/specs/2026-07-06-dashboard-overdue-invoices-widget-design.md`

---

### Task 1: `isOverdue` helper + invoices list page filter

**Files:**
- Create: `src/lib/invoices.ts`
- Modify: `src/app/dashboard/invoices/page.tsx`

**Interfaces:**
- Produces: `isOverdue(invoice: { status: string; due_date: string | null }): boolean` — exported
  from `src/lib/invoices.ts`. Task 2 imports this same function; do not change its name or
  signature without updating Task 2.

- [ ] **Step 1: Create the helper**

Write `src/lib/invoices.ts`:

```typescript
export function isOverdue(invoice: { status: string; due_date: string | null }): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') return false
  if (!invoice.due_date) return false
  return invoice.due_date < new Date().toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Wire it into the invoices list page**

Read `src/app/dashboard/invoices/page.tsx` (already read in full during planning — reproduced below
for reference; do not assume it matches exactly, re-read if it has changed).

Change the function signature and add the search param:

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import InvoiceTable from '@/components/invoices/InvoiceTable'
import { isOverdue } from '@/lib/invoices'

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ overdue?: string }> }) {
  const { overdue } = await searchParams
  const showOverdueOnly = overdue === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
```

(the rest of the function body down to the `draftCount`/`overdueCount` lines is unchanged except
the line below)

Change:
```typescript
  const overdueCount = (invoices ?? []).filter(i => i.status === 'overdue').length
```
to:
```typescript
  const overdueCount = (invoices ?? []).filter(isOverdue).length
```

(this fixes the same pre-existing dead-status bug on this page's own "Overdue" summary card —
it currently always reads 0 because nothing ever sets `status = 'overdue'`; using `isOverdue`
here means this card and the new dashboard card agree)

Change the invoice list section from:
```typescript
        {/* Invoice list */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <InvoiceTable invoices={(invoices ?? []) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]} />
        </div>
```
to:
```typescript
        {/* Invoice list */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <InvoiceTable
            invoices={(showOverdueOnly ? (invoices ?? []).filter(isOverdue) : (invoices ?? [])) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]}
            emptyMessage={showOverdueOnly ? 'No overdue invoices.' : undefined}
          />
        </div>
```

(omitting `emptyMessage` when not filtering falls back to `InvoiceTable`'s existing default prop —
check `src/components/invoices/InvoiceTable.tsx`'s function signature: `emptyMessage = 'No invoices yet.'`
— passing `undefined` explicitly is safe with a default parameter)

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean (tsc + eslint), no errors.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`pnpm dev` if not already running). As a user with at least one invoice
where `status = 'sent'` and `due_date` is in the past:
- Visit `/dashboard/invoices` — confirm the "Overdue" summary card now shows a non-zero count.
- Visit `/dashboard/invoices?overdue=1` — confirm only that invoice (and any other genuinely
  overdue ones) appear in the list, and the empty-state message would read "No overdue invoices."
  if there were none.
- Visit `/dashboard/invoices` (no param) — confirm the full list is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoices.ts src/app/dashboard/invoices/page.tsx
git commit -m "feat: invoices — compute overdue at read time, add overdue list filter"
```

---

### Task 2: Dashboard "Overdue invoices" metric card

**Files:**
- Modify: `src/components/dashboard/DashboardMetrics.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `isOverdue(invoice: { status: string; due_date: string | null }): boolean` from
  `src/lib/invoices.ts` (Task 1).
- Produces: `DashboardMetrics` gains two new required props, `overdueTotal: number` and
  `overdueCurrency: string` — no other task depends on these.

- [ ] **Step 1: Add the new card to `DashboardMetrics.tsx`**

Change the `Props` type from:
```typescript
type Props = {
  sessionsThisWeek: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
}
```
to:
```typescript
type Props = {
  sessionsThisWeek: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
  overdueTotal: number
  overdueCurrency: string
}
```

Change the icon import from:
```typescript
import { CalendarClock, FolderOpen, CheckSquare, Users } from 'lucide-react'
```
to:
```typescript
import { CalendarClock, FolderOpen, CheckSquare, Users, AlertTriangle } from 'lucide-react'
```

Change the function signature and grid from:
```typescript
export default function DashboardMetrics({ sessionsThisWeek, activeProjects, tasksCompleted, tasksTotal, activeClients }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
```
to:
```typescript
export default function DashboardMetrics({ sessionsThisWeek, activeProjects, tasksCompleted, tasksTotal, activeClients, overdueTotal, overdueCurrency }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
```

Add a 5th card after the "Active clients" `MetricCard` (before the closing `</div>`):
```typescript
      <MetricCard
        icon={AlertTriangle}
        value={`${overdueCurrency} ${overdueTotal.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        label="Overdue invoices"
        iconClass="bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400"
        glowClass="bg-red-500"
        href="/dashboard/invoices?overdue=1"
      />
```

- [ ] **Step 2: Compute the values in `src/app/dashboard/page.tsx`**

Add the import at the top, alongside the existing lib imports:
```typescript
import { isOverdue } from '@/lib/invoices'
```

In the first `Promise.all` stage (the one that currently fetches `sessionsRes, projectsRes,
clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes`), add
one more parallel query for invoices, scoped exactly like `/dashboard/invoices` already scopes
visibility. Change:
```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes] = await Promise.all([
```
to:
```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes] = await Promise.all([
```
and add this as the last entry in that same array (after the `supabase.rpc('get_unread_client_messages')` entry, matching the existing comma-separated array — add a trailing comma after that line, then this new entry before the closing `])`):
```typescript
    orgId
      ? supabase
          .from('invoices')
          .select('status, due_date, subtotal, currency')
          .neq('status', 'quote')
          .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
      : supabase
          .from('invoices')
          .select('status, due_date, subtotal, currency')
          .neq('status', 'quote')
          .eq('owner_id', user.id),
```

After the existing metric-derivation block (near `const rosterManaged = isTeamPlan(subscriptionRes) && !!orgId`), add:
```typescript
  const overdueInvoices = (invoicesRes.data ?? []).filter(isOverdue)
  const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.subtotal), 0)
  const overdueCurrency = overdueInvoices[0]?.currency ?? 'AUD'
```

Change the `<DashboardMetrics ... />` call from:
```typescript
        <DashboardMetrics
          sessionsThisWeek={sessionsThisWeek}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
        />
```
to:
```typescript
        <DashboardMetrics
          sessionsThisWeek={sessionsThisWeek}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
          overdueTotal={overdueTotal}
          overdueCurrency={overdueCurrency}
        />
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean (tsc + eslint), no errors. (This is the point where a mismatched
`DashboardMetrics` prop name/type between the two files would surface as a real tsc error, since
`DashboardMetrics`'s own props ARE strictly typed even though the raw Supabase query result isn't.)

- [ ] **Step 4: Manual smoke test**

On `/dashboard`:
- Confirm a 5th card, "Overdue invoices", appears in the metrics row (5 cards in one row on a wide
  desktop window; 2+2+1 wrapping on a narrow/mobile-width window).
- For a user/org with a genuinely overdue invoice (status `sent`, `due_date` in the past): confirm
  the card shows the correct non-zero dollar total, and clicking it navigates to
  `/dashboard/invoices?overdue=1` showing that invoice.
- For a user/org with nothing overdue: confirm the card shows `$0.00`, not blank or an error.
- Confirm the other 4 existing cards (Sessions this week, Active projects, Tasks complete, Active
  clients) are unchanged in value and behavior.
- If a solo Pro test account (no organisation) is available, confirm their card total reflects
  only their own invoices, not any other user's.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardMetrics.tsx src/app/dashboard/page.tsx
git commit -m "feat: dashboard — add overdue invoices metric card"
```

---

## Acceptance checklist

- [ ] Task 1: `isOverdue` helper created; invoices list page's own "Overdue" summary card now
  reflects real overdue invoices (was always 0 before); `?overdue=1` filters the list; build passes.
- [ ] Task 2: Dashboard shows a 5th "Overdue invoices" metric card with correct dollar total,
  correct click-through, correct zero-state; build passes.
- [ ] Manual smoke test from both tasks confirmed in a real browser session (not just `pnpm run
  build` — this project has no test runner).
