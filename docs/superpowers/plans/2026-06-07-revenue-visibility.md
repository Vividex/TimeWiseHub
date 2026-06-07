# Revenue Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **Staging note:** Authored by Claude; Codex commits this + the spec into `docs/superpowers/` and makes all file changes in `C:/GameForge/timewisehub`. Touches clients/invoices/income — no collision with the embed-fix or payslip work.

**Goal:** Per-client outstanding/paid revenue (clients list + detail page) and fast walk-in/cash sales attributed to a built-in Walk-in client. Dollar figures owner/admin only.

**Architecture:** One migration (`client_id` on income, `'sale'` source, `is_walkin` flag, backfill); mark-paid sets `client_id`; a quick-sale form; per-client aggregates surfaced in the clients list + a new detail page; org-aware invoices fetch.

**Tech Stack:** Next.js 16, React 19, Supabase + RLS, TypeScript, Tailwind v4. pnpm.

---

## Verification approach
No test runner (intentional). `pnpm build` + `pnpm lint`; no new RLS (reads stay scoped by existing policies); manual smoke per the spec. Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema-032-revenue-visibility.sql` | `income_entries.client_id` + index; `'sale'` source; `clients.is_walkin`; backfill. |
| `src/app/api/invoices/[id]/mark-paid/route.ts` | (modify) set `client_id` on the income row. |
| `src/components/clients/QuickSaleForm.tsx` | (create, owner/admin) find-or-create Walk-in client → record income. |
| `src/components/clients/ClientList.tsx` | (modify) show Outstanding/Paid + link to detail. |
| `src/app/dashboard/clients/page.tsx` | (modify) compute per-client aggregates (org-aware), gate to admin, render QuickSaleForm. |
| `src/app/dashboard/clients/[id]/page.tsx` | (create) client detail page. |
| `src/app/dashboard/invoices/page.tsx` | (modify) org-aware fetch. |

Build order: migration → mark-paid → quick-sale → list → clients page → detail page → invoices fix → verify/docs.

---

### Task 1: Migration `schema-032-revenue-visibility.sql`

**Files:** Create `supabase/schema-032-revenue-visibility.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- TimeWiseHub — Schema 032: Revenue visibility (per-client + walk-in)
-- ============================================================

alter table public.income_entries
  add column client_id uuid references public.clients(id) on delete set null;

create index income_entries_client on public.income_entries (client_id) where client_id is not null;

alter table public.income_entries
  drop constraint income_entries_source_type_check;
alter table public.income_entries
  add constraint income_entries_source_type_check
  check (source_type in ('manual', 'invoice', 'sale'));

alter table public.clients
  add column is_walkin boolean not null default false;

-- Backfill invoice-sourced income to the invoice's client.
update public.income_entries ie
set client_id = i.client_id
from public.invoices i
where ie.invoice_id = i.id and ie.client_id is null;
```

- [ ] **Step 2: Apply** — `mcp__supabase__apply_migration`, name `revenue_visibility`, query = the SQL.

- [ ] **Step 3: Verify**
```sql
select column_name from information_schema.columns where table_name='income_entries' and column_name='client_id';            -- 1 row
select column_name from information_schema.columns where table_name='clients' and column_name='is_walkin';                    -- 1 row
select pg_get_constraintdef(oid) from pg_constraint where conname='income_entries_source_type_check';                          -- includes 'sale'
select count(*) from income_entries where source_type='invoice' and client_id is null and invoice_id in (select id from invoices where client_id is not null); -- expect 0 (backfilled)
```

- [ ] **Step 4: Commit**
```bash
git add supabase/schema-032-revenue-visibility.sql
git commit -m "feat(revenue): income_entries.client_id + sale source + walk-in flag + backfill"
```

---

### Task 2: mark-paid sets `client_id`

**Files:** Modify `src/app/api/invoices/[id]/mark-paid/route.ts`

- [ ] **Step 1: Add `client_id` to the income insert.** In the `service.from('income_entries').insert({ ... })` call, add `client_id: invoice.client_id ?? null,`. (The select already loads the invoice; ensure `client_id` is in its `.select(...)` — add it: `.select('owner_id, org_id, client_id, subtotal, currency, invoice_number, clients(name)')`.)

```ts
    service.from('income_entries').insert({
      user_id: invoice.owner_id,
      org_id: invoice.org_id ?? null,
      client_id: invoice.client_id ?? null,
      amount: invoice.subtotal,
      currency: invoice.currency ?? 'AUD',
      category: 'Sales',
      date: today,
      description,
      source_type: 'invoice',
      invoice_id: id,
    }),
```

- [ ] **Step 2: Verify build** — `pnpm build`.
- [ ] **Step 3: Commit**
```bash
git add src/app/api/invoices/[id]/mark-paid/route.ts
git commit -m "feat(revenue): attribute paid-invoice income to its client"
```

---

### Task 3: `QuickSaleForm` (client, owner/admin)

**Files:** Create `src/components/clients/QuickSaleForm.tsx`

Context: records a walk-in/cash sale — finds or lazily creates the org/owner's Walk-in client (by `is_walkin`), then inserts an `income_entries` row (`source_type: 'sale'`). Mirrors `ClientForm`'s client-side pattern.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function QuickSaleForm({ orgId }: { orgId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setError('Enter an amount greater than 0.'); return }
    setLoading(true); setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Find or create the Walk-in client (by flag, scoped to org or owner).
    const finder = supabase.from('clients').select('id').eq('is_walkin', true)
    const { data: existing } = await (orgId
      ? finder.eq('org_id', orgId)
      : finder.eq('owner_id', user.id)
    ).limit(1).maybeSingle()

    let walkinId = existing?.id
    if (!walkinId) {
      const { data: created, error: cErr } = await supabase
        .from('clients')
        .insert({ owner_id: user.id, org_id: orgId, name: 'Walk-in / Cash', is_walkin: true })
        .select('id')
        .single()
      if (cErr || !created) { setError(cErr?.message ?? 'Could not create walk-in client.'); setLoading(false); return }
      walkinId = created.id
    }

    const { error: iErr } = await supabase.from('income_entries').insert({
      user_id: user.id,
      org_id: orgId,
      client_id: walkinId,
      amount: Number(amount),
      currency: 'AUD',
      category: 'Sales',
      date,
      description: note.trim() || null,
      source_type: 'sale',
    })

    if (iErr) { setError(iErr.message); setLoading(false); return }

    setAmount(''); setNote(''); setOpen(false)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600">
        {open ? 'Cancel' : '+ Record a sale'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount (AUD) *</label>
              <input required type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. counter sale"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
            {loading ? 'Saving…' : 'Record sale'}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build`.
- [ ] **Step 3: Commit**
```bash
git add src/components/clients/QuickSaleForm.tsx
git commit -m "feat(revenue): quick walk-in sale form (find-or-create walk-in client)"
```

---

### Task 4: `ClientList` — show revenue + link to detail

**Files:** Modify `src/components/clients/ClientList.tsx`

Context: extend the `Client` type with optional `outstanding`/`paid` (present only for owner/admin), render them, and link the client name to the detail page.

- [ ] **Step 1: Extend the type** — add to the `Client` type:
```tsx
  outstanding?: number
  paid?: number
```

- [ ] **Step 2: Add the import** at top:
```tsx
import Link from 'next/link'
```

- [ ] **Step 3: Link the name + render figures.** Replace the client name line:
```tsx
              <Link href={`/dashboard/clients/${c.id}`} className="text-base font-bold text-gray-900 truncate hover:text-cyan-600">{c.name}</Link>
```
And in the bottom row (the `border-t` div), append the figures when provided:
```tsx
            {c.outstanding !== undefined && (
              <span className="text-xs font-bold text-amber-600">Outstanding ${c.outstanding.toFixed(2)}</span>
            )}
            {c.paid !== undefined && (
              <span className="text-xs font-bold text-green-600">Paid ${c.paid.toFixed(2)}</span>
            )}
```

- [ ] **Step 4: Verify build** — `pnpm build`.
- [ ] **Step 5: Commit**
```bash
git add src/components/clients/ClientList.tsx
git commit -m "feat(revenue): per-client outstanding/paid + detail link in client list"
```

---

### Task 5: Clients page — aggregates + quick-sale (admin)

**Files:** Modify `src/app/dashboard/clients/page.tsx`

Context: for owner/admin, fetch the org/owner's open invoices + client-attributed income, aggregate per client, and pass `outstanding`/`paid` into `ClientList`; render `QuickSaleForm`. Non-admins see the list unchanged.

- [ ] **Step 1: Add imports**
```tsx
import QuickSaleForm from '@/components/clients/QuickSaleForm'
```

- [ ] **Step 2: After computing `clients` (the mapped array), add aggregates for admins.** Insert before the mapped `clients` is built — or compute maps and merge in. Replace the `clients` mapping block with:

```tsx
  // Per-client revenue (owner/admin only).
  const outstandingByClient = new Map<string, number>()
  const paidByClient = new Map<string, number>()
  if (isAdmin) {
    const scope = orgId
      ? { col: 'org_id', val: orgId }
      : { col: 'owner_id', val: user.id }

    const [{ data: openInvoices }, { data: clientIncome }] = await Promise.all([
      supabase.from('invoices').select('client_id, subtotal, status').eq(scope.col, scope.val).in('status', ['sent', 'overdue']),
      supabase.from('income_entries').select('client_id, amount').eq(scope.col, scope.val).not('client_id', 'is', null),
    ])

    for (const inv of openInvoices ?? []) {
      if (inv.client_id) outstandingByClient.set(inv.client_id, (outstandingByClient.get(inv.client_id) ?? 0) + Number(inv.subtotal))
    }
    for (const row of clientIncome ?? []) {
      if (row.client_id) paidByClient.set(row.client_id, (paidByClient.get(row.client_id) ?? 0) + Number(row.amount))
    }
  }

  const clients = (raw ?? []).map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    default_rate: c.default_rate,
    currency: c.currency,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    project_count: (c.projects as any[])?.length ?? 0,
    ...(isAdmin ? { outstanding: outstandingByClient.get(c.id) ?? 0, paid: paidByClient.get(c.id) ?? 0 } : {}),
  }))
```

- [ ] **Step 3: Render `QuickSaleForm` for admins.** Just under the existing `{canAdd && <ClientForm orgId={orgId} />}` line, add:
```tsx
        {isAdmin && <QuickSaleForm orgId={orgId} />}
```

- [ ] **Step 4: Verify build + lint** — `pnpm build` && `pnpm lint`.
- [ ] **Step 5: Commit**
```bash
git add src/app/dashboard/clients/page.tsx
git commit -m "feat(revenue): per-client revenue aggregates + quick-sale on clients page"
```

---

### Task 6: Client detail page

**Files:** Create `src/app/dashboard/clients/[id]/page.tsx`

Context: server component. Loads the client (RLS scopes), and for owner/admin shows totals + invoices + sales; non-financial members see contact info only.

- [ ] **Step 1: Create the page**

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
}
const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  let invoices: { id: string; invoice_number: string; status: string; issue_date: string; subtotal: number }[] = []
  let sales: { id: string; date: string; amount: number; description: string | null; source_type: string }[] = []
  let outstanding = 0
  let paid = 0
  if (isAdmin) {
    const [{ data: inv }, { data: inc }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, status, issue_date, subtotal').eq('client_id', id).order('issue_date', { ascending: false }),
      supabase.from('income_entries').select('id, date, amount, description, source_type').eq('client_id', id).order('date', { ascending: false }),
    ])
    invoices = (inv ?? []) as typeof invoices
    sales = (inc ?? []) as typeof sales
    outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.subtotal), 0)
    paid = sales.reduce((s, r) => s + Number(r.amount), 0)
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        {!isAdmin ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-500">
            Revenue details are visible to owners and admins only.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                <p className="mt-1 text-2xl font-black text-amber-600">{fmt(outstanding)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                <p className="mt-1 text-2xl font-black text-green-600">{fmt(paid)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Invoices</h2>
              {invoices.length === 0 ? <p className="text-sm font-semibold text-gray-400">No invoices.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map(i => (
                      <tr key={i.id}>
                        <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{i.invoice_number}</Link></td>
                        <td className="py-2 text-gray-500">{i.issue_date}</td>
                        <td className="py-2 text-right font-bold text-gray-900">{fmt(Number(i.subtotal))}</td>
                        <td className="py-2 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Sales &amp; payments</h2>
              {sales.length === 0 ? <p className="text-sm font-semibold text-gray-400">No recorded sales.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {sales.map(r => (
                      <tr key={r.id}>
                        <td className="py-2 text-gray-500">{r.date}</td>
                        <td className="py-2 text-gray-600">{r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}</td>
                        <td className="py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build`.
- [ ] **Step 3: Commit**
```bash
git add "src/app/dashboard/clients/[id]/page.tsx"
git commit -m "feat(revenue): per-client detail page (totals, invoices, sales)"
```

---

### Task 7: Org-aware invoices list

**Files:** Modify `src/app/dashboard/invoices/page.tsx`

Context: currently `.eq('owner_id', user.id)` — an org admin should see all org invoices.

- [ ] **Step 1: Make the fetch org-aware.** Replace the membership-less query. Add a membership lookup and branch:

```tsx
  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const invoiceQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, subtotal, currency, clients(name)')
    .order('created_at', { ascending: false })

  const { data: invoices } = orgId
    ? await invoiceQuery.or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
    : await invoiceQuery.eq('owner_id', user.id)
```

(Leaves the existing summary-card + table rendering unchanged.)

- [ ] **Step 2: Verify build + lint** — `pnpm build` && `pnpm lint`.
- [ ] **Step 3: Commit**
```bash
git add src/app/dashboard/invoices/page.tsx
git commit -m "fix(revenue): org admins see all org invoices, not just their own"
```

---

### Task 8: Final verification + docs

**Files:** Create `docs/superpowers/specs/2026-06-07-revenue-visibility-design.md` + `docs/superpowers/plans/2026-06-07-revenue-visibility.md` (from staging)

- [ ] **Step 1: Full build** — `pnpm build`.
- [ ] **Step 2: Manual smoke** — as admin: clients list shows Outstanding/Paid; "Record a sale" → appears under Walk-in client + in Revenue; open a client → detail totals/invoices/sales; mark an invoice paid → Outstanding↓, Paid↑. As employee/manager: clients list has no money columns; client detail shows contact only.
- [ ] **Step 3: Copy staged docs + commit**
```bash
git add docs/superpowers/specs/2026-06-07-revenue-visibility-design.md docs/superpowers/plans/2026-06-07-revenue-visibility.md
git commit -m "docs(revenue): revenue-visibility design spec + implementation plan"
```
- [ ] **Step 4: Push** — `git push origin master`.

---

## Self-Review

**1. Spec coverage:** `client_id` + source + flag + backfill → Task 1; mark-paid attribution → Task 2; walk-in quick-sale → Task 3; list columns + detail link → Tasks 4/5; detail page → Task 6; org-aware invoices → Task 7; admin-only gating → Tasks 5/6 (`isAdmin`). ✓

**2. Placeholder scan:** none; empty/zero states and error paths handled.

**3. Type consistency:** `ClientList`'s `Client` type gains optional `outstanding`/`paid` (Task 4), supplied conditionally by the clients page (Task 5). `QuickSaleForm({ orgId })` matches its call site. The detail page is self-contained. `isAdmin` (already computed in the clients page) is the financial gate, consistent with `resolveRole().isFinancial` (owner/admin).

---

## Notes for the executor
- No new RLS — existing `income_entries`/`invoices`/`clients` policies already scope these reads to owner/admin appropriately.
- Apply the migration (Task 1) before the UI tasks.
- Keep dollar figures behind `isAdmin`; never show client revenue to managers/employees.
