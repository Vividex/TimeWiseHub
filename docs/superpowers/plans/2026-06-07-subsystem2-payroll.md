# Subsystem 2 — Payroll / Pay Statements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Staging note:** Authored by Claude. Codex commits this to `docs/superpowers/plans/2026-06-07-subsystem2-payroll.md` (spec alongside it) and makes all file changes in `C:/GameForge/timewisehub`. Builds on shipped Subsystem 1.

**Goal:** Owner/admin runs a pay run that turns approved timesheet hours into informational pay statements (gross + super), visible only to each employee and owner/admin, with an employee-controlled live indicative net.

**Architecture:** New migration `schema-030` adds payroll settings + `pay_runs`/`pay_statements` (RLS mirrors Subsystem 1). An API route `POST /api/pay-runs` computes/persists a run. A reusable client `PayStatementCard` renders one statement and computes net live from `profiles.tax_estimate_pct`. The three finance views' payroll seams are filled. **Path C — no ATO lodgement, no tax-bracket math.**

**Tech Stack:** Next.js 16 (App Router, async server components, route handlers), React 19, Supabase (Postgres + RLS, `supabase-server`/`supabase-browser`), TypeScript, Tailwind v4. pnpm.

---

## Verification approach (same as Subsystem 1)

The repo has **no test runner** — do not add one. Verify with:
- **RLS:** `pg_policies` + `request.jwt.claims` role simulation in a transaction.
- **Pure logic** (`derivePayPeriod`, `compute.ts`): reasoned truth table + exercised by the build.
- **App code:** `pnpm build` + `pnpm lint`.
Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema-030-payroll.sql` | Settings columns + `pay_runs`/`pay_statements` + RLS + indexes. |
| `src/lib/payroll/period.ts` | `PayCadence` + `derivePayPeriod()` (pure). |
| `src/lib/payroll/compute.ts` | Pure gross/super/net math. |
| `src/app/api/pay-runs/route.ts` | `POST` — compute + persist a pay run (owner/admin). |
| `src/components/finance/PayStatementCard.tsx` | Client; one statement; live net + tax-% persistence. |
| `src/components/finance/RunPayControl.tsx` | Client; date + notes → `POST /api/pay-runs`. |
| `src/components/finance/EmployeeFinanceView.tsx` | (modify) own statements. |
| `src/components/finance/TeamApprovalsView.tsx` | (modify) manager's own statements; re-add `userId`. |
| `src/components/finance/CompanyFinanceView.tsx` | (modify) payroll section, org scope. |
| `src/components/OrgBillingSettingsForm.tsx` + `src/app/settings/page.tsx` | (modify) cadence + super-rate settings. |

Build order: migration → pure libs → API route → card → run control → view wirings → settings → final verify.

---

### Task 1: Migration `schema-030-payroll.sql`

**Files:**
- Create: `supabase/schema-030-payroll.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/schema-030-payroll.sql`:

```sql
-- ============================================================
-- TimeWiseHub — Schema 030: Payroll / pay statements (Path C, informational)
-- ============================================================

-- Per-org payroll settings (governed by existing org-settings UPDATE policy).
alter table public.organisations
  add column pay_cadence text not null default 'fortnightly'
    check (pay_cadence in ('weekly', 'fortnightly', 'monthly')),
  add column super_rate numeric(5,2) not null default 12.0
    check (super_rate >= 0 and super_rate <= 100);

-- Per-person remembered tax estimate % (self-editable via profiles own-row policy).
alter table public.profiles
  add column tax_estimate_pct numeric(5,2)
    check (tax_estimate_pct is null or (tax_estimate_pct >= 0 and tax_estimate_pct <= 100));

-- Pay runs: one per org per period.
create table public.pay_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  period_start date not null,
  period_end   date not null,
  created_by   uuid not null references public.profiles,
  created_at   timestamptz not null default now(),
  unique (org_id, period_start, period_end)
);

alter table public.pay_runs enable row level security;

create policy "org_financial_manage_runs" on public.pay_runs for all
  using (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  )
  with check (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Pay statements.
create table public.pay_statements (
  id               uuid primary key default gen_random_uuid(),
  pay_run_id       uuid not null references public.pay_runs on delete cascade,
  org_id           uuid not null references public.organisations on delete cascade,
  user_id          uuid not null references public.profiles on delete cascade,
  period_start     date not null,
  period_end       date not null,
  approved_seconds integer not null default 0 check (approved_seconds >= 0),
  hourly_rate      numeric(10,2) not null,
  gross            numeric(12,2) not null,
  super_rate       numeric(5,2) not null,
  super_amount     numeric(12,2) not null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.pay_statements enable row level security;

-- SELECT: own row OR owner/admin of the org.
create policy "own_or_financial_read" on public.pay_statements for select
  using (
    user_id = auth.uid()
    or org_id in (select org_id from public.organisation_members
                  where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- INSERT/UPDATE/DELETE: owner/admin only.
create policy "financial_insert" on public.pay_statements for insert
  with check (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "financial_delete" on public.pay_statements for delete
  using (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create index pay_statements_user on public.pay_statements (user_id, period_start desc);
create index pay_statements_org on public.pay_statements (org_id, period_start desc);
```

> Note: SELECT and write policies are split by command (no `for all` on statements) so the employee SELECT path is unambiguous and writes are financial-only.

- [ ] **Step 2: Apply**

`mcp__supabase__apply_migration`, name `payroll`, query = the SQL above.

- [ ] **Step 3: Verify policies exist**

```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in ('pay_runs','pay_statements')
order by tablename, policyname;
```
Expected: `pay_runs` → `org_financial_manage_runs` (ALL); `pay_statements` → `own_or_financial_read` (SELECT), `financial_insert` (INSERT), `financial_delete` (DELETE).

- [ ] **Step 4: Verify role enforcement (rollback-only fixtures)**

Use the same JWT-simulation technique as Subsystem 1. Insert temporary org/owner/employee/pay_run/pay_statement rows in a transaction, then assert reads per role, then `rollback`. Concretely:

```sql
begin;
  -- temp fixtures
  insert into public.organisations (id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','T','t-payroll') ;
  -- assume two profiles already exist; pick real ids:
  -- select id, email from public.profiles limit 2;  (owner_id, emp_id)
  insert into public.organisation_members (org_id, user_id, role) values
    ('00000000-0000-0000-0000-0000000000a1','<OWNER_ID>','owner'),
    ('00000000-0000-0000-0000-0000000000a1','<EMP_ID>','employee');
  insert into public.pay_runs (id, org_id, period_start, period_end, created_by) values
    ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','2026-05-04','2026-05-17','<OWNER_ID>');
  insert into public.pay_statements (pay_run_id, org_id, user_id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','<EMP_ID>','2026-05-04','2026-05-17',273600,38,2888,12,346.56);

  -- employee sees own statement (expect 1)
  select set_config('request.jwt.claims', json_build_object('sub','<EMP_ID>','role','authenticated')::text, true);
  set local role authenticated;
  select count(*) as emp_sees from public.pay_statements where org_id='00000000-0000-0000-0000-0000000000a1';
  reset role;

  -- owner sees all (expect 1)
  select set_config('request.jwt.claims', json_build_object('sub','<OWNER_ID>','role','authenticated')::text, true);
  set local role authenticated;
  select count(*) as owner_sees from public.pay_statements where org_id='00000000-0000-0000-0000-0000000000a1';
  reset role;
rollback;
```
Expected: `emp_sees = 1`, `owner_sees = 1`. (An unrelated employee would see 0; verify by repeating with a third profile id not equal to `<EMP_ID>` → expect 0.)

- [ ] **Step 5: Commit**

```bash
git add supabase/schema-030-payroll.sql
git commit -m "feat(payroll): pay_runs + pay_statements tables, settings columns, RLS"
```

---

### Task 2: `src/lib/payroll/period.ts`

**Files:**
- Create: `src/lib/payroll/period.ts`

- [ ] **Step 1: Create the helper**

```ts
export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/** ISO date (YYYY-MM-DD) → period boundaries. UTC math avoids TZ drift. */
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${anchorISO}T00:00:00Z`)

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { periodStart: iso(start), periodEnd: iso(end) }
  }

  const day = d.getUTCDay() // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - mondayOffset)
  const span = cadence === 'weekly' ? 6 : 13
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + span)
  return { periodStart: iso(start), periodEnd: iso(end) }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Verify build + reason through the truth table**

Run: `pnpm build` → succeeds.
Confirm by hand:
- `derivePayPeriod('weekly','2026-05-06')` (a Wednesday) → start `2026-05-04` (Mon), end `2026-05-10`.
- `derivePayPeriod('fortnightly','2026-05-04')` → start `2026-05-04`, end `2026-05-17`.
- `derivePayPeriod('monthly','2026-05-20')` → start `2026-05-01`, end `2026-05-31`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/payroll/period.ts
git commit -m "feat(payroll): pay-period derivation helper"
```

---

### Task 3: `src/lib/payroll/compute.ts`

**Files:**
- Create: `src/lib/payroll/compute.ts`

- [ ] **Step 1: Create the pure math**

```ts
/** Round half-up to cents. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeGross(approvedSeconds: number, hourlyRate: number): number {
  return round2((approvedSeconds / 3600) * hourlyRate)
}

export function computeSuper(gross: number, superRatePct: number): number {
  return round2(gross * (superRatePct / 100))
}

/** Indicative only — employee's own assumed tax %. */
export function computeIndicativeNet(gross: number, taxPct: number): number {
  return round2(gross - gross * (taxPct / 100))
}
```

- [ ] **Step 2: Verify build + truth table**

Run: `pnpm build` → succeeds.
Confirm: `computeGross(273600, 38)` → 2888 (76h × $38); `computeSuper(2888, 12)` → 346.56; `computeIndicativeNet(2888, 22)` → 2252.64.

- [ ] **Step 3: Commit**

```bash
git add src/lib/payroll/compute.ts
git commit -m "feat(payroll): pure gross/super/net helpers"
```

---

### Task 4: `POST /api/pay-runs`

**Files:**
- Create: `src/app/api/pay-runs/route.ts`

Context: owner/admin-only. Reads org cadence/super_rate, derives the period, sums approved hours per member, snapshots rate + super_rate, writes a `pay_run` + `pay_statements`. Members with no `hourly_rate` are skipped and reported. Empty runs are rolled back. Uses the server Supabase client so RLS applies.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveRole } from '@/lib/auth/resolve-role'
import { derivePayPeriod, type PayCadence } from '@/lib/payroll/period'
import { computeGross, computeSuper } from '@/lib/payroll/compute'

export async function POST(request: Request) {
  const ctx = await resolveRole()
  if (!ctx || !ctx.isFinancial || !ctx.orgId) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const anchor = body?.anchorDate
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  if (typeof anchor !== 'string' || !anchor) {
    return NextResponse.json({ error: 'anchorDate required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organisations')
    .select('pay_cadence, super_rate')
    .eq('id', ctx.orgId)
    .single()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const cadence = org.pay_cadence as PayCadence
  const superRate = Number(org.super_rate)
  const { periodStart, periodEnd } = derivePayPeriod(cadence, anchor)

  const { data: sheets } = await supabase
    .from('timesheets')
    .select('user_id, total_seconds')
    .eq('org_id', ctx.orgId)
    .eq('status', 'approved')
    .gte('week_start', periodStart)
    .lte('week_start', periodEnd)

  const rows = (sheets ?? []) as { user_id: string; total_seconds: number }[]
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No approved hours found for this period.' }, { status: 422 })
  }

  const secondsByUser = new Map<string, number>()
  for (const r of rows) {
    secondsByUser.set(r.user_id, (secondsByUser.get(r.user_id) ?? 0) + (r.total_seconds ?? 0))
  }

  const userIds = [...secondsByUser.keys()]
  const { data: membersData } = await supabase
    .from('organisation_members')
    .select('user_id, hourly_rate, profiles(full_name, email)')
    .eq('org_id', ctx.orgId)
    .in('user_id', userIds)

  const members = (membersData ?? []) as unknown as {
    user_id: string
    hourly_rate: number | null
    profiles: { full_name: string | null; email: string } | null
  }[]
  const memberByUser = new Map(members.map(m => [m.user_id, m]))

  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .insert({ org_id: ctx.orgId, period_start: periodStart, period_end: periodEnd, created_by: ctx.userId })
    .select('id')
    .single()

  if (runError || !run) {
    const dup = runError?.code === '23505'
    return NextResponse.json(
      { error: dup ? 'A pay run already exists for this period. Delete it to re-run.' : (runError?.message ?? 'Failed to create pay run') },
      { status: dup ? 409 : 500 },
    )
  }

  const statements: Record<string, unknown>[] = []
  const skipped: { name: string; reason: string }[] = []

  for (const [userId, seconds] of secondsByUser) {
    const m = memberByUser.get(userId)
    const name = m?.profiles?.full_name ?? m?.profiles?.email ?? 'Unknown'
    if (m?.hourly_rate == null) {
      skipped.push({ name, reason: 'no rate set' })
      continue
    }
    const rate = Number(m.hourly_rate)
    const gross = computeGross(seconds, rate)
    statements.push({
      pay_run_id: run.id,
      org_id: ctx.orgId,
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      approved_seconds: seconds,
      hourly_rate: rate,
      gross,
      super_rate: superRate,
      super_amount: computeSuper(gross, superRate),
      notes,
    })
  }

  if (statements.length === 0) {
    await supabase.from('pay_runs').delete().eq('id', run.id)
    return NextResponse.json(
      { error: 'No statements created — no contributing member had an hourly rate set.', skipped },
      { status: 422 },
    )
  }

  const { error: stmtError } = await supabase.from('pay_statements').insert(statements)
  if (stmtError) {
    await supabase.from('pay_runs').delete().eq('id', run.id)
    return NextResponse.json({ error: stmtError.message }, { status: 500 })
  }

  return NextResponse.json({ created: statements.length, skipped, periodStart, periodEnd })
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build` → succeeds (route compiles; `/api/pay-runs` appears in the route table).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pay-runs/route.ts
git commit -m "feat(payroll): POST /api/pay-runs compute + persist a pay run"
```

---

### Task 5: `PayStatementCard` (client)

**Files:**
- Create: `src/components/finance/PayStatementCard.tsx`

Context: renders one statement. `showNet` enables the employee's editable tax-% → live net block (hidden in owner drill-down). When shown, blur persists `profiles.tax_estimate_pct` for `userId` via `supabase-browser`.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { computeIndicativeNet } from '@/lib/payroll/compute'

export type PayStatement = {
  id: string
  period_start: string
  period_end: string
  approved_seconds: number
  hourly_rate: number
  gross: number
  super_rate: number
  super_amount: number
  notes: string | null
}

function formatAUD(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export default function PayStatementCard({
  statement,
  showNet,
  userId,
  initialTaxPct,
}: {
  statement: PayStatement
  showNet: boolean
  userId?: string
  initialTaxPct?: number | null
}) {
  const [taxPct, setTaxPct] = useState<string>(initialTaxPct != null ? String(initialTaxPct) : '')

  const hours = (statement.approved_seconds / 3600).toFixed(2)
  const pctNum = taxPct.trim() === '' ? null : Number(taxPct)
  const net = pctNum != null && !Number.isNaN(pctNum) ? computeIndicativeNet(statement.gross, pctNum) : null

  async function persistTaxPct() {
    if (!showNet || !userId) return
    const supabase = createClient()
    const value = taxPct.trim() === '' ? null : Number(taxPct)
    await supabase.from('profiles').update({ tax_estimate_pct: value }).eq('id', userId)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        ⚠ Indicative only — not a payslip or tax advice. Figures are estimates. Refer to the ATO and your payroll provider.
      </div>
      <div className="space-y-2 p-4 text-sm">
        <div className="flex justify-between font-semibold text-slate-500 dark:text-slate-400">
          <span>{statement.period_start} – {statement.period_end}</span>
          <span>{hours} h @ {formatAUD(statement.hourly_rate)}</span>
        </div>

        <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-slate-800">
          <span className="font-bold text-slate-900 dark:text-slate-100">Gross</span>
          <span className="font-extrabold text-green-600 dark:text-green-400">{formatAUD(statement.gross)}</span>
        </div>

        {showNet && (
          <>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`tax-${statement.id}`} className="text-slate-600 dark:text-slate-300">Estimated tax %</label>
              <input
                id={`tax-${statement.id}`}
                type="number" min="0" max="100" step="0.1"
                value={taxPct}
                onChange={e => setTaxPct(e.target.value)}
                onBlur={persistTaxPct}
                placeholder="—"
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-slate-100">Indicative net</span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100">{net != null ? formatAUD(net) : '—'}</span>
            </div>
            <a
              href="https://www.ato.gov.au/calculators-and-tools/tax-withheld-calculator"
              target="_blank" rel="noopener noreferrer"
              className="block text-xs font-semibold text-cyan-600 hover:underline"
            >
              Estimate your tax % with the ATO Tax Withheld calculator →
            </a>
          </>
        )}

        <div className="flex justify-between border-t border-gray-100 pt-2 text-blue-700 dark:border-slate-800 dark:text-blue-300">
          <span className="font-semibold">Super ({statement.super_rate}%, paid on top)</span>
          <span className="font-bold">+ {formatAUD(statement.super_amount)}</span>
        </div>

        {statement.notes && (
          <p className="border-t border-gray-100 pt-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Note: {statement.notes}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/PayStatementCard.tsx
git commit -m "feat(payroll): reusable PayStatementCard with live indicative net"
```

---

### Task 6: `RunPayControl` (client)

**Files:**
- Create: `src/components/finance/RunPayControl.tsx`

Context: owner/admin form — a date (anchor within the period) + optional notes → `POST /api/pay-runs`. Shows the result summary and refreshes.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RunPayControl({ cadence }: { cadence: string }) {
  const router = useRouter()
  const [anchorDate, setAnchorDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true); setMessage(null); setError(null)

    const res = await fetch('/api/pay-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchorDate, notes }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data?.error ?? 'Pay run failed.')
    } else {
      const skippedNote = data.skipped?.length ? ` (${data.skipped.length} skipped — no rate set)` : ''
      setMessage(`Created ${data.created} statement(s) for ${data.periodStart} – ${data.periodEnd}${skippedNote}.`)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={run} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="anchorDate" className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Pay period date ({cadence})
          </label>
          <input
            id="anchorDate" type="date" required value={anchorDate}
            onChange={e => setAnchorDate(e.target.value)}
            className="mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="payNotes" className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Notes / reference (optional)
          </label>
          <input
            id="payNotes" type="text" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. incl. bonus"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run pay'}
        </button>
      </div>
      {message && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">{message}</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/RunPayControl.tsx
git commit -m "feat(payroll): RunPayControl form posting to /api/pay-runs"
```

---

### Task 7: Wire `EmployeeFinanceView`

**Files:**
- Modify: `src/components/finance/EmployeeFinanceView.tsx`

Replace the placeholder block (current lines 29-34) with the employee's real statements; keep the recent-timesheets table.

- [ ] **Step 1: Replace the file**

```tsx
import { createClient } from '@/lib/supabase-server'
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'

type OwnTimesheet = {
  id: string
  week_start: string
  status: string
  total_seconds: number
}

function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

export default async function EmployeeFinanceView({ userId }: { userId: string }) {
  const supabase = await createClient()

  const [{ data: statementsData }, { data: profile }, { data: tsData }] = await Promise.all([
    supabase
      .from('pay_statements')
      .select('id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(12),
    supabase.from('profiles').select('tax_estimate_pct').eq('id', userId).single(),
    supabase
      .from('timesheets')
      .select('id, week_start, status, total_seconds')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(12),
  ])

  const statements = (statementsData ?? []) as PayStatement[]
  const taxPct = (profile?.tax_estimate_pct ?? null) as number | null
  const timesheets = (tsData ?? []) as OwnTimesheet[]

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statements</h2>
          {statements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                No pay statements yet. They appear here after your employer runs pay — visible only to you and your employer.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {statements.map(s => (
                <PayStatementCard key={s.id} statement={s} showNet userId={userId} initialTaxPct={taxPct} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your recent timesheets</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {timesheets.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">No timesheets yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Week of</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hours</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map(ts => (
                    <tr key={ts.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{ts.week_start}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatHours(ts.total_seconds)}</td>
                      <td className="px-4 py-3 text-right font-semibold capitalize text-gray-600 dark:text-slate-300">{ts.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/EmployeeFinanceView.tsx
git commit -m "feat(payroll): employee pay statements with live net"
```

---

### Task 8: Wire `TeamApprovalsView` (manager's own statements)

**Files:**
- Modify: `src/components/finance/TeamApprovalsView.tsx`
- Modify: `src/app/dashboard/finance/page.tsx` (re-add `userId` to the call)

Context: re-add the `userId` prop (removed during S1 lint cleanup) and replace the "Your pay statement" placeholder (current lines 71-76) with the manager's own statements via `PayStatementCard`. The team-hours table is unchanged.

- [ ] **Step 1: Update the manager view**

Change the signature and add the fetch + render. Replace the component signature line:

```tsx
export default async function TeamApprovalsView({ orgId, userId }: { orgId: string; userId: string }) {
```

Add imports at the top:

```tsx
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'
```

After the existing `timesheets`/`pending` setup, fetch the manager's own statements + tax %:

```tsx
  const [{ data: ownStmts }, { data: profile }] = await Promise.all([
    supabase
      .from('pay_statements')
      .select('id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(6),
    supabase.from('profiles').select('tax_estimate_pct').eq('id', userId).single(),
  ])
  const ownStatements = (ownStmts ?? []) as PayStatement[]
  const ownTaxPct = (profile?.tax_estimate_pct ?? null) as number | null
```

Replace the placeholder block (the `<div>` containing "Your pay statement" + "Coming with the payroll module") with:

```tsx
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statements</h2>
          {ownStatements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                No pay statements yet — visible only to you and your employer.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {ownStatements.map(s => (
                <PayStatementCard key={s.id} statement={s} showNet userId={userId} initialTaxPct={ownTaxPct} />
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 2: Re-add `userId` at the call site**

In `src/app/dashboard/finance/page.tsx`, the manager branch:

```tsx
  if (ctx.role === 'manager') {
    return <TeamApprovalsView orgId={ctx.orgId} userId={ctx.userId} />
  }
```

- [ ] **Step 3: Verify build + lint** — `pnpm build` and `pnpm lint` → no new issues (the previously-unused `userId` is now used).

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/TeamApprovalsView.tsx src/app/dashboard/finance/page.tsx
git commit -m "feat(payroll): manager's own pay statements; re-add userId prop"
```

---

### Task 9: Wire `CompanyFinanceView` payroll section (org scope)

**Files:**
- Modify: `src/components/finance/CompanyFinanceView.tsx`

Context: replace the payroll placeholder (current lines 139-144) — **org scope only** — with a "Run pay" control, recent pay runs with cost totals, and drill-down statements (`showNet={false}`). Net profit stays a placeholder line (Subsystem 3).

- [ ] **Step 1: Add imports**

At the top of the file, add:

```tsx
import RunPayControl from '@/components/finance/RunPayControl'
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'
```

- [ ] **Step 2: Fetch payroll data for org scope**

Immediately after `const monthlyData = ...` (and before the `return`), add:

```tsx
  // Payroll section data — org scope only.
  type PayRun = {
    id: string
    period_start: string
    period_end: string
    created_at: string
    pay_statements: PayStatement[]
  }
  let payRuns: PayRun[] = []
  let payCadence = 'fortnightly'
  if (scope.type === 'org') {
    const [{ data: runs }, { data: orgRow }] = await Promise.all([
      supabase
        .from('pay_runs')
        .select('id, period_start, period_end, created_at, pay_statements(id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes)')
        .eq('org_id', scope.orgId)
        .order('period_start', { ascending: false })
        .limit(6),
      supabase.from('organisations').select('pay_cadence').eq('id', scope.orgId).single(),
    ])
    payRuns = (runs ?? []) as unknown as PayRun[]
    payCadence = (orgRow?.pay_cadence as string) ?? 'fortnightly'
  }
```

- [ ] **Step 3: Replace the payroll placeholder block**

Replace the existing placeholder (`<div className="rounded-2xl border border-dashed ...">` containing "Payroll & net profit" / "Coming with the payroll module") with:

```tsx
        {scope.type === 'org' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Payroll</h2>
            <RunPayControl cadence={payCadence} />

            {payRuns.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-4 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No pay runs yet. Use “Run pay” above to generate statements from approved hours.
              </p>
            ) : (
              payRuns.map(run => {
                const cost = run.pay_statements.reduce((sum, s) => sum + Number(s.gross) + Number(s.super_amount), 0)
                return (
                  <div key={run.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{run.period_start} – {run.period_end}</span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {run.pay_statements.length} statement(s) · cost {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cost)}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {run.pay_statements.map(s => (
                        <PayStatementCard key={s.id} statement={s} showNet={false} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}

            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Net profit</h3>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
                Revenue − expenses − payroll roll-up arrives with the company P&amp;L module.
              </p>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Verify build** — `pnpm build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/CompanyFinanceView.tsx
git commit -m "feat(payroll): owner payroll section — run pay, pay runs, drill-down"
```

---

### Task 10: Settings — pay cadence + super rate

**Files:**
- Modify: `src/components/OrgBillingSettingsForm.tsx`
- Modify: `src/app/settings/page.tsx`

Context: extend the existing org settings form with two fields, persisted to `organisations` (existing update policy covers it).

- [ ] **Step 1: Extend the form props + state**

In `OrgBillingSettingsForm.tsx`, change the props signature to add the two initial values:

```tsx
export default function OrgBillingSettingsForm({
  orgId,
  initialRoundingMinutes,
  initialPayCadence,
  initialSuperRate,
  initialMembers,
}: {
  orgId: string
  initialRoundingMinutes: number
  initialPayCadence: string
  initialSuperRate: number
  initialMembers: OrgMember[]
}) {
```

Add state below the existing `roundingEnabled` state:

```tsx
  const [payCadence, setPayCadence] = useState(initialPayCadence)
  const [superRate, setSuperRate] = useState(String(initialSuperRate))
```

- [ ] **Step 2: Persist the new fields**

In `handleSave`, change the organisations update to include them:

```tsx
    const { error: orgError } = await supabase
      .from('organisations')
      .update({
        time_rounding_minutes: roundingEnabled ? 15 : 0,
        pay_cadence: payCadence,
        super_rate: superRate.trim() ? Number(superRate) : 12,
      })
      .eq('id', orgId)
```

- [ ] **Step 3: Add the UI controls**

Immediately after the rounding toggle block (the `<div className="flex items-start justify-between ...">` … `</div>`), add:

```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="payCadence" className="block text-sm font-bold text-gray-900">Pay cadence</label>
          <select
            id="payCadence" value={payCadence}
            onChange={e => setPayCadence(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label htmlFor="superRate" className="block text-sm font-bold text-gray-900">Super rate %</label>
          <input
            id="superRate" type="number" min="0" max="100" step="0.1"
            value={superRate}
            onChange={e => setSuperRate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>
```

- [ ] **Step 4: Pass the new props from the settings page**

In `src/app/settings/page.tsx`, extend the organisation select (currently `.select('time_rounding_minutes')`):

```tsx
      supabase
        .from('organisations')
        .select('time_rounding_minutes, pay_cadence, super_rate')
        .eq('id', membership.org_id)
        .single(),
```

And the component usage:

```tsx
          <OrgBillingSettingsForm
            orgId={membership.org_id}
            initialRoundingMinutes={organisation?.time_rounding_minutes ?? 0}
            initialPayCadence={organisation?.pay_cadence ?? 'fortnightly'}
            initialSuperRate={organisation?.super_rate ?? 12}
            initialMembers={(members ?? []) as unknown as Parameters<typeof OrgBillingSettingsForm>[0]['initialMembers']}
          />
```

- [ ] **Step 5: Verify build + lint** — `pnpm build` and `pnpm lint` → no new issues.

- [ ] **Step 6: Commit**

```bash
git add src/components/OrgBillingSettingsForm.tsx src/app/settings/page.tsx
git commit -m "feat(payroll): org pay cadence + super rate settings"
```

---

### Task 11: Final verification + docs

**Files:**
- Create: `docs/superpowers/specs/2026-06-07-subsystem2-payroll-design.md` (from staging)
- Create: `docs/superpowers/plans/2026-06-07-subsystem2-payroll.md` (from staging, this file)

- [ ] **Step 1: Full build of the final tree**

Run: `pnpm build`
Expected: succeeds; route table includes `/api/pay-runs` and `/dashboard/finance`.

- [ ] **Step 2: Manual smoke test**

`pnpm dev`, then as an **owner** of an org with approved timesheets: open `/dashboard/finance` → Payroll → pick a period date → Run pay → see the created summary and the run appear. As that org's **employee**: open `/dashboard/finance` → see your statement, enter a tax % → net updates live, reload → % persisted. As a **manager**: confirm team hours show **no dollar amounts** and you see only your own statement.

- [ ] **Step 3: Copy staged docs into the repo + commit**

```bash
git add docs/superpowers/specs/2026-06-07-subsystem2-payroll-design.md docs/superpowers/plans/2026-06-07-subsystem2-payroll.md
git commit -m "docs(payroll): subsystem 2 design spec + implementation plan"
```

---

## Self-Review

**1. Spec coverage:**
- Settings (cadence, super rate, tax %) → Task 1 (columns) + Task 10 (cadence/super UI) + Task 5/7 (tax % UI). ✓
- `pay_runs`/`pay_statements` + RLS → Task 1. ✓
- Pay-run compute/persist → Task 4 (+ pure libs Tasks 2,3). ✓
- `PayStatementCard` + live net → Task 5. ✓
- Seam fills: employee → Task 7; manager-own → Task 8; owner section + Run pay → Task 9. ✓
- Skip-and-report no-rate, empty-run rollback, duplicate-period → Task 4. ✓
- Visibility (own or owner/admin; manager no others' $) → Task 1 RLS + verified Task 1 Step 4 + manual Task 11. ✓
- Net profit deferred to Subsystem 3 → placeholder kept in Task 9. ✓

**2. Placeholder scan:** No TBD/TODO. Error paths have concrete handling. The ATO URL is a real link (may need updating if the ATO restructures — acceptable).

**3. Type consistency:** `PayStatement` defined in Task 5, imported in Tasks 7/8/9. `PayCadence`/`derivePayPeriod` (Task 2) used in Task 4. `computeGross/computeSuper` (Task 3) used in Task 4; `computeIndicativeNet` (Task 3) used in Task 5. `resolveRole`/`RoleContext.isFinancial/orgId/userId` (S1) used in Task 4. `OrgBillingSettingsForm` prop additions (Task 10) match the settings-page call. The `userId` prop re-added to `TeamApprovalsView` (Task 8) matches the page call site updated in the same task.

---

## Notes for the executor
- Subsystem 2 of 3. Do not build the net-profit roll-up (Subsystem 3) — keep the placeholder.
- Tasks 7/8/9 modify files Codex created in Subsystem 1; the line numbers reference the shipped versions. If they've drifted, locate the placeholder by its "Coming with the payroll module" text.
- Apply the migration (Task 1) via Supabase MCP and verify RLS before building UI.
