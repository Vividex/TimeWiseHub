# Tutoring Per-Lesson Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Let a tutor (or anyone) bill completed sessions directly, one invoice per selection of
lessons, reusing the existing invoice creation route rather than building a parallel path.

**Architecture:** `sessions.invoice_id` and `invoice_items.session_id` mirror the existing
`time_entries.invoice_id`/`invoice_items.time_entry_id` pattern exactly. The existing
`/api/invoices` POST route gains a `session_id` branch alongside its existing `time_entry_id`
handling. A new `BillableSessionsPanel` client component shows completed, uninvoiced sessions as a
checklist on the client's Sessions page.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` plus manual browser testing.
- Not gated to the tutoring profile — available whenever a client has completed, uninvoiced
  sessions, regardless of workspace profile.
- Packages/credits (the prepaid model) are out of scope — a separate future phase.
- `NewInvoiceForm.tsx` (the existing time-entry-based invoicing flow) is not modified — this is a
  parallel, simpler path, not a replacement.
- The `/api/invoices` route's existing authorization model (service-role client, authenticated-only,
  no ownership check on `clientId`/`time_entry_id`s) is a known pre-existing limitation, not
  something this plan fixes or worsens — the new `session_id` handling matches, not exceeds, the
  existing trust level of the `time_entry_id` handling it sits beside.
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-per-lesson-billing-design.md`.

---

### Task 1: Database migration — sessions.invoice_id and invoice_items.session_id

**Files:**
- Create: `supabase/schema-085-tutoring-lesson-billing.sql`

**Interfaces:**
- Produces: `public.sessions.invoice_id` (nullable FK to `invoices`), `public.invoice_items.session_id`
  (nullable FK to `sessions`). Task 2's API route and Task 3's UI both depend on these exact
  column names.

This task is **conductor-only** (DB migrations always are in this project).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 085: Tutoring per-lesson billing
-- Second deep-dive feature for the Tutoring workspace profile (not
-- gated to tutoring -- billing sessions directly isn't an inherently
-- tutoring-only concept). Mirrors the existing time_entries.invoice_id
-- / invoice_items.time_entry_id pattern exactly. Run via Supabase MCP
-- apply_migration (name: tutoring_lesson_billing)
-- ============================================================

alter table public.sessions
  add column invoice_id uuid references public.invoices on delete set null;

create index sessions_invoice on public.sessions (invoice_id) where invoice_id is not null;

alter table public.invoice_items
  add column session_id uuid references public.sessions on delete set null;
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Name: `tutoring_lesson_billing`, project id `sdwwlnnsijcadkdwsvud`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'invoice_id';
```

Expected: 1 row, `uuid`, nullable.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'invoice_items' and column_name = 'session_id';
```

Expected: 1 row, `uuid`, nullable.

```sql
select indexname from pg_indexes where schemaname = 'public' and tablename = 'sessions' and indexname = 'sessions_invoice';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-085-tutoring-lesson-billing.sql
git commit -m "feat: tutoring per-lesson billing — database migration"
```

---

### Task 2: Extend /api/invoices to accept session_id line items

**Files:**
- Modify: `src/app/api/invoices/route.ts`

**Interfaces:**
- Consumes: `sessions.invoice_id`, `invoice_items.session_id` (Task 1).
- Produces: the `POST` handler now accepts an optional `session_id` per item and an optional
  `invoicedSessionIds` array in the request body — Task 3's `BillableSessionsPanel` depends on
  this exact shape (`items: [{ description, quantity, unit_price, session_id }]`).

- [ ] **Step 1: Read `src/app/api/invoices/route.ts`, then:**

  1. Change:
     ```typescript
     const { clientId, orgId, items, dueDate, notes, currency, issueDate, invoicedEntryIds, isQuote } = await req.json()
     ```
     to:
     ```typescript
     const { clientId, orgId, items, dueDate, notes, currency, issueDate, invoicedEntryIds, invoicedSessionIds, isQuote } = await req.json()
     ```

  2. Change the line items mapping from:
     ```typescript
     const lineItems = items.map((item: { description: string; quantity: number; unit_price: number; time_entry_id?: string }, idx: number) => ({
       invoice_id: invoice.id,
       description: item.description,
       quantity: item.quantity,
       unit_price: item.unit_price,
       time_entry_id: item.time_entry_id || null,
       sort_order: idx,
     }))
     ```
     to:
     ```typescript
     const lineItems = items.map((item: { description: string; quantity: number; unit_price: number; time_entry_id?: string; session_id?: string }, idx: number) => ({
       invoice_id: invoice.id,
       description: item.description,
       quantity: item.quantity,
       unit_price: item.unit_price,
       time_entry_id: item.time_entry_id || null,
       session_id: item.session_id || null,
       sort_order: idx,
     }))
     ```

  3. Right after the existing "Mark time entries as invoiced" block (after the `if
     (uniqueEntryIds.length > 0) { ... }` closing brace, before `return NextResponse.json({ id:
     invoice.id, invoice_number: invoiceNumber })`), add an equivalent block for sessions:
     ```typescript
       // Mark sessions as invoiced
       const allSessionIds = [
         ...(invoicedSessionIds ?? []),
         ...items.map((i: { session_id?: string }) => i.session_id).filter(Boolean),
       ]
       const uniqueSessionIds = [...new Set(allSessionIds)] as string[]
       if (uniqueSessionIds.length > 0) {
         await service.from('sessions').update({ invoice_id: invoice.id }).in('id', uniqueSessionIds)
       }
     ```

- [ ] **Step 2: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/invoices/route.ts
git commit -m "feat: tutoring per-lesson billing — /api/invoices session_id support"
```

---

### Task 3: BillableSessionsPanel and sessions page integration

**Files:**
- Create: `src/components/clients/BillableSessionsPanel.tsx`
- Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`

**Interfaces:**
- Consumes: `POST /api/invoices` (Task 2, exact body shape `{ clientId, orgId, currency,
  issueDate, items: [{ description, quantity, unit_price, session_id }] }`).
- Produces: nothing for later tasks — this is the last task in the plan.

- [ ] **Step 1: Write `src/components/clients/BillableSessionsPanel.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type BillableSession = {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  studentName: string | null
}

export default function BillableSessionsPanel({
  clientId,
  orgId,
  defaultRate,
  currency,
  sessions,
}: {
  clientId: string
  orgId: string | null
  defaultRate: number
  currency: string
  sessions: BillableSession[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (sessions.length === 0) return null

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedSessions = sessions.filter(s => selected.has(s.id))
  const subtotal = selectedSessions.reduce((sum, s) => sum + defaultRate * (s.duration_minutes / 60), 0)

  async function handleSubmit() {
    if (selectedSessions.length === 0) return
    setSubmitting(true)
    setError(null)

    const items = selectedSessions.map(s => ({
      description: `${s.title} — ${new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      quantity: s.duration_minutes / 60,
      unit_price: defaultRate,
      session_id: s.id,
    }))

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        orgId,
        currency,
        issueDate: new Date().toISOString().slice(0, 10),
        items,
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      setError(result.error ?? 'Failed to create invoice')
      setSubmitting(false)
      return
    }
    router.push(`/dashboard/invoices/${result.id}`)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Billable lessons</h2>
      <ul className="divide-y divide-gray-50 dark:divide-slate-800">
        {sessions.map(s => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {s.title}{s.studentName ? ` · ${s.studentName}` : ''}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {s.duration_minutes} min
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {currency} {(defaultRate * (s.duration_minutes / 60)).toFixed(2)}
            </p>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-slate-800">
        <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
          Subtotal: {currency} {subtotal.toFixed(2)}
        </p>
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0 || submitting}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : `Create invoice (${selected.size})`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Read `src/app/dashboard/clients/[id]/sessions/page.tsx`, then:**

  1. Add the import: `import BillableSessionsPanel from '@/components/clients/BillableSessionsPanel'`.

  2. Change:
     ```typescript
     const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
     ```
     to:
     ```typescript
     const { data: client } = await supabase.from('clients').select('id, name, default_rate, currency').eq('id', id).maybeSingle()
     ```

  3. Right after the existing `students` query (before `const items = ...`), add:
     ```typescript
       const { data: billableSessions } = await supabase
         .from('sessions')
         .select('id, title, scheduled_at, duration_minutes, students(name)')
         .eq('client_id', id)
         .eq('status', 'completed')
         .is('invoice_id', null)
         .order('scheduled_at', { ascending: true })

       const billableItems = (billableSessions ?? []).map(s => {
         const student = (s.students as unknown as { name: string } | null)
         return {
           id: s.id,
           title: s.title as string,
           scheduled_at: s.scheduled_at as string,
           duration_minutes: s.duration_minutes as number,
           studentName: student?.name ?? null,
         }
       })
     ```

  4. Right after the header `<div className="flex items-center justify-between">...</div>` block
     (the one containing the "Sessions" heading and `NewSessionModal`), and before the `<TileGrid>`,
     add:
     ```typescript
             <BillableSessionsPanel
               clientId={id}
               orgId={orgId}
               defaultRate={client.default_rate ?? 0}
               currency={client.currency}
               sessions={billableItems}
             />
     ```

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 5: Manual smoke test**

1. Find or create a completed session for a test client with no `invoice_id` set. Confirm it
   appears in the new "Billable lessons" panel on that client's Sessions page, with the correct
   computed price (`client.default_rate × duration/60`).
2. Confirm a client/student with zero completed-uninvoiced sessions shows no panel at all (not
   even an empty state).
3. Select the session, click "Create invoice", confirm it redirects to the new invoice's detail
   page and the line item/amount is correct.
4. Return to the client's Sessions page, confirm that session no longer appears in the "Billable
   lessons" panel (its `invoice_id` is now set) — verify via SQL:
   `select invoice_id from sessions where id = '<session id>'` should be non-null.
5. Confirm this all works with the real account's current (non-tutoring) profile — this feature
   is not gated to tutoring.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/BillableSessionsPanel.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx"
git commit -m "feat: tutoring per-lesson billing — BillableSessionsPanel and sessions page integration"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), API route extension (Task 2), UI + page integration
  (Task 3) all match the spec's Architecture section. The spec's "out of scope" list
  (packages/credits, bundling multiple lessons into one line item, changes to `NewInvoiceForm.tsx`,
  a non-hourly flat per-lesson price) has no task, correctly.
- **Placeholder scan:** none — every step has complete code or an exact line-level edit
  instruction.
- **Type consistency:** the `items` shape (`{ description, quantity, unit_price, session_id }`)
  produced by `BillableSessionsPanel` (Task 3) matches exactly what Task 2's extended
  `/api/invoices` route destructures and inserts. `BillableSession` type in Task 3 matches the
  `billableItems` shape produced by the sessions page query in the same task.
