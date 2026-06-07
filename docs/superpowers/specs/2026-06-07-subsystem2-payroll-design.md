# Subsystem 2 — Payroll / Pay Statements: Design

> **Staging note:** Authored by Claude. Codex commits to `docs/superpowers/specs/2026-06-07-subsystem2-payroll-design.md` and makes all file changes in `C:/GameForge/timewisehub`. Built **on top of Subsystem 1** (already shipped & verified): reuses `resolveRole()`, mirrors the `org_financial_read` RLS pattern, and fills the three "Coming with payroll" seams.

**Goal:** Let an owner/admin run a pay run that turns each employee's approved timesheet hours into an informational pay statement (gross + super), visible only to that employee and the owner/admin — with an employee-controlled, live-computed indicative net. **Path C: never an official payslip, never lodged to the ATO.**

**Architecture:** A new migration adds payroll settings and two tables (`pay_runs`, `pay_statements`) with RLS mirroring Subsystem 1. A server action computes statements from approved `timesheets` × `organisation_members.hourly_rate`, snapshotting the rate and super rate onto immutable statement rows. A reusable `PayStatementCard` renders one statement; the indicative net is computed live from the employee's own `profiles.tax_estimate_pct`. The existing finance views' payroll seams are replaced with real data.

**Tech Stack:** Next.js 16 (App Router, async server components + a server action), React 19, Supabase (Postgres + RLS), TypeScript, Tailwind v4. Package manager: pnpm.

---

## Scope

This is **Subsystem 2 of 3**.

**In scope:**
- Payroll settings: per-org pay cadence + super rate; per-person tax estimate %.
- `pay_runs` + `pay_statements` tables and RLS.
- The pay-run server action (compute + persist).
- A `PayStatementCard` and the wiring into all three finance views (employee, manager-own, owner drill-down) + a "Run pay" control.

**Out of scope:**
- **Net-profit / company P&L roll-up** — that is **Subsystem 3**. This subsystem surfaces a *payroll cost* total to owners but does not compute net profit.
- Overtime/penalty rates, leave accruals, allowances, multiple rates per person.
- Any ATO/STP lodgement, official PAYG withholding, or tax-bracket calculation.

---

## Locked product decisions (from requirements)

- Pay cadence configurable per org: `weekly | fortnightly | monthly`.
- Only **approved** timesheet hours count.
- Gross = approved hours × `hourly_rate`; rate **snapshotted** at pay-run time.
- Super = gross × super_rate; rate configurable per org, default **12%**; **snapshotted**; shown "paid on top".
- Tax: **we compute none.** Employee enters their own %, indicative net computed **live**, ATO calculator link + standing caveat. % remembered per person.
- Generation: **manual pay run** by owner/admin; nothing generated until run.
- Statement carries a free-text **notes/reference** set by owner/admin at pay-run time.
- Visibility: a statement is visible to **its employee** + **owner/admin** only.

---

## Data model — migration `schema-030-payroll.sql`

(`030` is the next free number after the shipped `schema-029-finance-role-visibility.sql`.)

### Settings columns

```sql
-- Per-org payroll settings. Existing "Owners and admins can update
-- organisation settings" UPDATE policy already governs these columns.
alter table public.organisations
  add column pay_cadence text not null default 'fortnightly'
    check (pay_cadence in ('weekly', 'fortnightly', 'monthly')),
  add column super_rate numeric(5,2) not null default 12.0
    check (super_rate >= 0 and super_rate <= 100);

-- Per-person remembered tax estimate %. Lives on profiles (NOT
-- organisation_members) so the employee can edit it via the existing
-- "Users can update their own profile" policy WITHOUT being able to edit
-- their own role/hourly_rate (which a member-row update policy would expose).
alter table public.profiles
  add column tax_estimate_pct numeric(5,2)
    check (tax_estimate_pct is null or (tax_estimate_pct >= 0 and tax_estimate_pct <= 100));
```

### `pay_runs`

```sql
create table public.pay_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  period_start date not null,
  period_end   date not null,
  created_by   uuid not null references public.profiles,
  created_at   timestamptz not null default now(),
  unique (org_id, period_start, period_end)  -- one run per org per period
);

alter table public.pay_runs enable row level security;

-- Owner/admin only — managers and employees never see pay runs.
create policy "org_financial_manage_runs" on public.pay_runs for all
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
```

### `pay_statements`

```sql
create table public.pay_statements (
  id               uuid primary key default gen_random_uuid(),
  pay_run_id       uuid not null references public.pay_runs on delete cascade,
  org_id           uuid not null references public.organisations on delete cascade,
  user_id          uuid not null references public.profiles on delete cascade,
  period_start     date not null,
  period_end       date not null,
  approved_seconds integer not null default 0 check (approved_seconds >= 0),
  hourly_rate      numeric(10,2) not null,   -- snapshot at run time
  gross            numeric(12,2) not null,
  super_rate       numeric(5,2) not null,    -- snapshot at run time
  super_amount     numeric(12,2) not null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.pay_statements enable row level security;

-- Employee sees their OWN statements; owner/admin see all org statements.
-- Mirrors the Subsystem 1 pattern (own-row OR financial-role-of-org).
create policy "own_or_financial_read" on public.pay_statements for select
  using (
    user_id = auth.uid()
    or org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Only owner/admin create/delete statements (via pay runs).
create policy "financial_write" on public.pay_statements for all
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create index pay_statements_user on public.pay_statements (user_id, period_start desc);
create index pay_statements_org on public.pay_statements (org_id, period_start desc);
```

> **Note on the `for all` + separate select policy:** Postgres evaluates policies per-command; the `own_or_financial_read` SELECT policy and the `financial_write` ALL policy combine so that SELECT is allowed for own-row-or-financial, while INSERT/UPDATE/DELETE require financial. (A `for all` policy also applies to SELECT, so the two SELECT-capable policies are OR'd — net effect: employees can still only SELECT, never write, because `financial_write`'s USING for non-financial users is false and there is no own-row write policy.) The implementation plan will verify this with role simulation rather than relying on prose.

**Tax is intentionally NOT stored** on `pay_statements` — gross and super are the employer-cost facts; the indicative net is computed live from `profiles.tax_estimate_pct`.

---

## Pay-period derivation

A pure helper maps the org cadence + a chosen date to period boundaries. Timesheets are included by `week_start` (Monday-start), which gives the monthly straddle rule for free (a week belongs to the month containing its `week_start`).

```ts
// src/lib/payroll/period.ts
export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/** ISO date (YYYY-MM-DD) → ISO date. All math in UTC to avoid TZ drift. */
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

  // weekly/fortnightly: snap anchor back to its Monday, then span 7 or 14 days.
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

Inclusion rule for a run: `timesheets.status = 'approved' AND week_start >= periodStart AND week_start <= periodEnd`.

---

## Pay-run mechanics

An **API route** `POST /api/pay-runs` (matching the codebase's existing `/api/*` mutation pattern, e.g. invoices — the project uses no server actions). It uses the server Supabase client (`@/lib/supabase-server`), so the caller's session + RLS apply. Executed by owner/admin:

1. Re-resolve role server-side; reject if not `isFinancial` or no `orgId` (defence in depth on top of RLS).
2. Read the org's `pay_cadence`; derive `{ periodStart, periodEnd }` from the submitted anchor date.
3. Fetch approved timesheets in range, grouped by `user_id`, summing `total_seconds`.
4. Fetch each contributing member's `hourly_rate` and the org `super_rate`.
5. For each member **with a non-null `hourly_rate`**: `gross = round(seconds/3600 * rate, 2)`, `super_amount = round(gross * super_rate/100, 2)`.
6. Insert one `pay_runs` row, then the `pay_statements` rows (rate + super_rate snapshotted; `notes` applied from the form).
7. Return a summary: `{ created: n, skipped: [{name, reason: 'no rate set'}] }`.

**Idempotency:** the `unique(org_id, period_start, period_end)` constraint blocks a duplicate run; the action surfaces "a pay run already exists for this period — delete it to re-run." Owner/admin can delete a pay run (cascade deletes its statements) to redo.

**Rounding:** half-up to cents, computed in TypeScript before insert; columns are `numeric(12,2)`.

---

## UI integration

### Reusable `PayStatementCard` (`src/components/finance/PayStatementCard.tsx`, client)
Renders one statement: caveat banner, period, approved hours, hourly rate, **gross**, **super (rate, on top)**, notes, and — for the viewing employee only — a tax-% input (pre-filled from `profiles.tax_estimate_pct`) that computes **indicative net = gross − gross × pct/100** live, plus the ATO calculator link. In owner/admin drill-down the tax/net block is hidden (the owner sees employer-cost facts, not the employee's personal net assumption).

### Tax-% persistence
The `PayStatementCard` is a client component; it updates `profiles.tax_estimate_pct` for the current user directly via `@/lib/supabase-browser` on blur (RLS already restricts to own row), matching the existing `OrgBillingSettingsForm` pattern. Net updates locally in React state without a round-trip; the blur write just persists the preference.

### Seam replacements
- **`EmployeeFinanceView`** (replaces the placeholder at lines 29-34): fetch own `pay_statements` (RLS scopes to own), render a list of `PayStatementCard`s with the tax/net block; keep the existing "recent timesheets" table below.
- **`TeamApprovalsView`** (replaces lines 71-76): fetch the manager's own `pay_statements` (`user_id = auth.uid()`), render with `PayStatementCard`. The team-hours table is unchanged. (This is also where the `userId` prop removed during S1 lint cleanup comes back — re-add it.)
- **`CompanyFinanceView`** (replaces the payroll seam at lines 139-144, **org scope only**): a "Payroll" section with a **Run pay** control (date picker + notes → server action), the **payroll cost total** (Σ gross + Σ super) for the selected period, a list of pay runs, and drill-down into each run's statements (`PayStatementCard`, tax/net hidden). The solo/user scope shows nothing here. **Net profit remains a Subsystem 3 placeholder.**

### Settings
The org settings page gains **Pay cadence** (select) and **Super rate %** (number) fields for owner/admin, persisted to `organisations` (existing update policy covers it).

---

## Error handling

- **Member with no `hourly_rate`:** skipped, reported in the run summary; never produces a $0 statement silently.
- **No approved timesheets in period:** the run creates a `pay_run` with zero statements and reports "no approved hours found" (or the action declines to create an empty run — plan picks one explicitly).
- **Duplicate period:** unique constraint → friendly "already exists" message.
- **Non-financial user hitting the action directly:** rejected server-side even though RLS would also block the insert.
- **Employee with no tax % set:** net shows as "—" with a prompt to enter a % / use the ATO calculator; gross and super still display.
- **RLS denial:** queries return empty, views render their empty states; no crash on null data.

---

## Verification approach

Same as Subsystem 1 (the repo has no test runner):
- **RLS (security-critical):** `pg_policies` inspection + `request.jwt.claims` role simulation in a transaction — assert an employee reads only their own statements, a manager reads none, owner/admin read all, and only owner/admin can insert.
- **Pure logic:** `derivePayPeriod` and the gross/super math verified by a reasoned truth table (no runner) and exercised through the build.
- **App code:** `pnpm build` + `pnpm lint`.
- **Manual smoke:** run a pay run as owner; confirm the employee sees their statement with a working live-net field and the manager sees no dollar figures for others.

---

## Files

- Create: `supabase/schema-030-payroll.sql`
- Create: `src/lib/payroll/period.ts`
- Create: `src/lib/payroll/compute.ts` (pure gross/super helpers)
- Create: `src/app/api/pay-runs/route.ts` (POST handler — compute + persist a pay run)
- Create: `src/components/finance/PayStatementCard.tsx` (client; also persists tax % via supabase-browser)
- Create: `src/components/finance/RunPayControl.tsx` (client form → `POST /api/pay-runs`)
- Modify: `src/components/finance/EmployeeFinanceView.tsx` (fill seam)
- Modify: `src/components/finance/TeamApprovalsView.tsx` (fill seam; re-add `userId`)
- Modify: `src/components/finance/CompanyFinanceView.tsx` (payroll section, org scope)
- Modify: the org settings page (add cadence + super rate fields) — exact path confirmed by Codex against `src/app/settings` / `/dashboard/settings`.

---

## Resolved facts (verified against shipped code)

1. RLS pattern to mirror: `org_financial_read` on `income_entries` (`schema-029`).
2. `resolveRole()` returns `{ userId, orgId, role, isFinancial, isManager }` — reuse as-is.
3. Settings column pattern: `alter table ... add column`; org update policy "Owners and admins can update organisation settings" already exists (`schema-021`).
4. `organisation_members.hourly_rate` is `numeric(10,2)` and **nullable** → skip-and-report logic required.
5. `timesheets`: `status` enum includes `approved`; `total_seconds integer`; `week_start` Monday-start. Source of approved hours.
6. Seams to fill: `EmployeeFinanceView` 29-34, `TeamApprovalsView` 71-76, `CompanyFinanceView` 139-144.
7. Next migration number: `schema-030`.

---

## Open item for Codex

- Confirm the settings page path/structure (`/settings` vs `/dashboard/settings`) and follow its existing form pattern when adding the cadence + super-rate fields.
