# Revenue Visibility (per-client + walk-in sales) — Design

> **Staging note:** Authored by Claude. Codex commits to `docs/superpowers/specs/...` and makes all file changes in `C:/GameForge/timewisehub`. Touches the clients/invoices/income area — no file collision with the in-flight embed-fix or payslip work.

**Goal:** Make money-in legible per client. Owner/admin can see each client's outstanding vs paid revenue (list columns + a detail page), and capture everyday walk-in/cash sales fast via a "Record a sale" action attributed to a built-in Walk-in client.

**Architecture:** Mostly surfacing existing data. One migration adds `income_entries.client_id` (so all revenue rolls up per client), a `clients.is_walkin` flag, and a `'sale'` source type; backfills invoice-sourced income; and the mark-paid route sets `client_id`. UI: clients list gains Outstanding/Paid columns, a new client detail page, and a quick-sale action — all dollar figures gated to owner/admin (same privacy tier as the P&L).

**Tech Stack:** Next.js 16 (server components + client forms), React 19, Supabase + RLS, TypeScript, Tailwind v4. pnpm.

---

## Scope

**In scope:** `client_id` on income; Walk-in client + quick-sale; per-client Outstanding/Paid columns; client detail page; org-aware invoices list; owner/admin gating of revenue figures.

**Out of scope:** changing invoice creation/Stripe flow; aged-receivables/dunning automation; multi-currency aggregation (assume AUD, as the rest of the app does); the global search feature (separate cycle).

---

## Locked decisions
- Walk-in sales → **quick "Record a sale"** action → income attributed to a built-in **"Walk-in / Cash"** client.
- Per-client revenue → **clients list columns (Outstanding, Paid) + a `/dashboard/clients/[id]` detail page**.
- **Dollar figures are owner/admin only**; the plain client list stays visible to all org members without revenue numbers.

---

## Data model — migration `schema-032-revenue-visibility.sql`

(`032` is next after `schema-031-payslips.sql`.)

```sql
-- Attribute any revenue (invoiced or walk-in) to a client.
alter table public.income_entries
  add column client_id uuid references public.clients(id) on delete set null;

create index income_entries_client on public.income_entries (client_id) where client_id is not null;

-- Allow a 'sale' (walk-in/cash) source alongside manual + invoice.
alter table public.income_entries
  drop constraint income_entries_source_type_check;
alter table public.income_entries
  add constraint income_entries_source_type_check
  check (source_type in ('manual', 'invoice', 'sale'));

-- Mark the per-org built-in walk-in client.
alter table public.clients
  add column is_walkin boolean not null default false;

-- Backfill: link existing invoice-sourced income to the invoice's client.
update public.income_entries ie
set client_id = i.client_id
from public.invoices i
where ie.invoice_id = i.id and ie.client_id is null;
```

No new RLS needed: `income_entries` already has `owner_all` (own) + `org_financial_read` (owner/admin); `clients` already has owner/org policies. Reads stay correctly scoped.

**Mark-paid route update** (`src/app/api/invoices/[id]/mark-paid/route.ts`): include `client_id: invoice.client_id ?? null` in the `income_entries.insert(...)` so future paid invoices attribute to the client.

---

## Walk-in client (lazy, per org/owner)

A single Walk-in client per organisation (or per owner, when solo). Found-or-created on first quick-sale:
- Look up: `clients` where `is_walkin = true` and (`org_id = orgId` if in an org, else `owner_id = userId`).
- If none, insert `{ name: 'Walk-in / Cash', is_walkin: true, owner_id, org_id }`.
- Reuse thereafter. (The `is_walkin` flag — not the name — identifies it, so renaming the display label won't break attribution.)

---

## Quick-sale flow

A **"Record a sale"** action (owner/admin only) — amount, date (default today), optional note:
1. Resolve/create the Walk-in client (above).
2. Insert `income_entries`: `{ user_id, org_id, client_id: walkinId, amount, currency 'AUD', category 'Sales', date, description: note, source_type: 'sale' }`.
3. Refresh. The sale immediately appears in Revenue (P&L) and under the Walk-in client.

Lives on the clients area (revenue context) as a button/form. Implemented client-side via `supabase-browser` (matching `ClientForm`/`ExpenseForm`).

---

## Per-client revenue

**Definitions (per client):**
- **Outstanding** = Σ `subtotal` of that client's invoices with status `sent` or `overdue`.
- **Paid / realized** = Σ `amount` of `income_entries` with that `client_id` (covers invoice-paid *and* walk-in).

**Clients list (`/dashboard/clients`):** for owner/admin, add **Outstanding** and **Paid** columns. Compute by fetching the org's open invoices + income (with `client_id`) and aggregating per client in the page (typical client counts make this cheap). Non-financial members see the existing list unchanged (no money columns).

**Client detail (`/dashboard/clients/[id]`, new):** client info + headline totals (Outstanding / Paid / lifetime) + their **invoice list** (number, dates, amount, status) + their **walk-in/manual sales** list. Financial sections render only for `isFinancial`; a non-financial member visiting sees just the client's contact info.

---

## Org-aware invoices fix

`/dashboard/invoices/page.tsx` currently filters `.eq('owner_id', user.id)`, so in an org an admin sees only their own invoices. Change to org-aware (mirror the clients page): when the user has an `org_id`, query `.or('owner_id.eq.<uid>,org_id.eq.<org>')`; otherwise keep `owner_id`. The invoices RLS already permits org admin access. (The same org-aware fetch feeds the per-client Outstanding figures.)

---

## Visibility summary
- **Client records:** all org members (existing behaviour).
- **Revenue figures** (Outstanding/Paid columns, detail financials, quick-sale, invoices): **owner/admin only** — gated via `resolveRole().isFinancial` in the pages, consistent with the P&L privacy tier. Managers/employees never see client money.

---

## Error handling
- Quick-sale by a non-financial user: blocked by UI gating; income RLS still scopes reads.
- Walk-in client race (two quick-sales create two): acceptable; optional follow-up is a partial unique index `where is_walkin`. v1 tolerates it (find-or-create picks the first).
- Client with no invoices/sales: totals show $0.00.
- Backfill is idempotent (`where client_id is null`).

---

## Verification
No test runner (intentional). `pnpm build` + `pnpm lint`. RLS unchanged (no new policies) — verify the financial gating by role simulation only where relevant (income reads). Manual smoke: as admin, record a walk-in sale → it appears under the Walk-in client and in Revenue; a client's Outstanding reflects its sent/overdue invoices; mark an invoice paid → Outstanding drops, Paid rises, client_id set; as employee/manager, the clients list shows no money columns.

---

## Files
- Create: `supabase/schema-032-revenue-visibility.sql`
- Modify: `src/app/api/invoices/[id]/mark-paid/route.ts` (set `client_id`)
- Modify: `src/app/dashboard/invoices/page.tsx` (org-aware fetch)
- Modify: `src/app/dashboard/clients/page.tsx` (Outstanding/Paid columns for owner/admin; aggregates)
- Modify: `src/components/clients/ClientList.tsx` (render money columns + link to detail) — confirm exact prop shape
- Create: `src/app/dashboard/clients/[id]/page.tsx` (client detail)
- Create: `src/components/clients/QuickSaleForm.tsx` (client; owner/admin)
- Create: `src/components/clients/RecordSaleButton.tsx` or fold the form into the clients page (owner/admin)

---

## Resolved facts (verified against the codebase)
1. `income_entries` (schema-027): no `client_id` today; `source_type` check is `('manual','invoice')`; has `invoice_id`. RLS: `owner_all` + `org_financial_read` (owner/admin).
2. `invoices` (schema-019): status enum incl. `sent`/`overdue`/`paid`; `client_id`, `subtotal`, `owner_id`, `org_id`. RLS allows owner + org admin.
3. `clients` (schema-018): `owner_id`, `org_id`, `archived`, `default_rate`; org members can view; org admins manage.
4. mark-paid route already inserts an `income_entries` row on payment — just needs `client_id` added.
5. Invoices list page filters by `owner_id` only (org-awareness gap).
6. `resolveRole().isFinancial` (owner/admin) available for UI gating.
7. Next migration number: `schema-032`.
