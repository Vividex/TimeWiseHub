# Tutoring Per-Lesson Billing

## Goal
Let a tutor (or anyone) bill completed sessions directly, one invoice per selection of lessons,
reusing the existing invoice creation route rather than building a parallel path. Second
deep-dive feature for the Tutoring workspace profile — not gated to tutoring.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-per-lesson-billing-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-tutoring-per-lesson-billing.md`
- Two billing rhythms exist for tutoring (per-lesson and prepaid packages/credits) — this phase is
  per-lesson only, the simpler and more commonly-needed mode per user framing. Packages/credits
  deferred to a future phase.
- `sessions.invoice_id` and `invoice_items.session_id` mirror the existing
  `time_entries.invoice_id`/`invoice_items.time_entry_id` pattern exactly. The existing
  `/api/invoices` route is extended, not replaced — `NewInvoiceForm.tsx`'s time-entry-based flow
  is untouched.
- Pricing reuses `clients.default_rate` (hourly) × session duration — no new pricing field.
  `client.default_rate` is nullable; falls back to `0`, matching `NewInvoiceForm.tsx`'s own
  existing fallback for the same field.
- **Not gated to the tutoring profile** — billing sessions directly isn't an inherently
  tutoring-only concept (a personal trainer might equally want this). Available whenever a client
  has completed, uninvoiced sessions, regardless of workspace profile.
- Known pre-existing limitation, not introduced here: `/api/invoices` uses the service-role
  client and only checks the caller is authenticated, no ownership verification on
  `clientId`/entry IDs. The new `session_id` handling matches, not exceeds, this existing trust
  level.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-3's manual smoke test does NOT require switching workspace profile — this feature works
  regardless of profile, confirmed with the real account's current (non-tutoring) profile.

---

## C-1 — Database migration: sessions.invoice_id and invoice_items.session_id

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-085-tutoring-lesson-billing.sql`:
  ```sql
  alter table public.sessions
    add column invoice_id uuid references public.invoices on delete set null;

  create index sessions_invoice on public.sessions (invoice_id) where invoice_id is not null;

  alter table public.invoice_items
    add column session_id uuid references public.sessions on delete set null;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `tutoring_lesson_billing`).
- [x] Verify via MCP `execute_sql`:
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
- [x] Commit: `git add supabase/schema-085-tutoring-lesson-billing.sql && git commit -m "feat: tutoring per-lesson billing — database migration"`

---

## C-2 — Extend /api/invoices to accept session_id line items

*Codex edits:*
- [ ] Read `src/app/api/invoices/route.ts`, then:
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
  3. Right after the existing "Mark time entries as invoiced" block, before the final `return
     NextResponse.json({ id: invoice.id, invoice_number: invoiceNumber })`, add:
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
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/api/invoices/route.ts && git commit -m "feat: tutoring per-lesson billing — /api/invoices session_id support"`

---

## C-3 — BillableSessionsPanel and sessions page integration

*Codex edits:*
- [ ] Create `src/components/clients/BillableSessionsPanel.tsx`:
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
- [ ] Read `src/app/dashboard/clients/[id]/sessions/page.tsx`, then:
  1. Add import `import BillableSessionsPanel from '@/components/clients/BillableSessionsPanel'`.
  2. Change `const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()`
     to `const { data: client } = await supabase.from('clients').select('id, name, default_rate, currency').eq('id', id).maybeSingle()`.
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
     (Sessions heading + `NewSessionModal`), before `<TileGrid>`, add:
     ```typescript
             <BillableSessionsPanel
               clientId={id}
               orgId={orgId}
               defaultRate={client.default_rate ?? 0}
               currency={client.currency}
               sessions={billableItems}
             />
     ```
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: find/create a completed session with no `invoice_id`, confirm it appears
  in the "Billable lessons" panel with the correct computed price; confirm a client with zero
  completed-uninvoiced sessions shows no panel at all; select it, create an invoice, confirm
  redirect + correct line item; confirm the session no longer appears in the panel (SQL check:
  `invoice_id` now set); confirm this all works under the real account's current (non-tutoring)
  profile, since this feature isn't gated.
- [ ] Commit: `git add src/components/clients/BillableSessionsPanel.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx" && git commit -m "feat: tutoring per-lesson billing — BillableSessionsPanel and sessions page integration"`

---

## Acceptance checklist
- [x] C-1: `sessions.invoice_id` + `invoice_items.session_id` + index applied and verified
- [ ] C-2: `/api/invoices` accepts and processes `session_id` line items, build passes
- [ ] C-3: `BillableSessionsPanel` created and wired in, manual smoke confirms full flow works
  regardless of workspace profile

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser + SQL smoke required for C-3.
