# Design: Dark Mode · Finance Section · Sidebar Restructure

**Date:** 2026-06-07  
**Status:** Approved  
**Scope:** Three independent but co-delivered features for TimeWiseHub

---

## 1. Dark Mode

### Approach
Install `next-themes` for SSR-safe theme management. Tailwind v4 `@custom-variant` enables `dark:` utility classes. The `<html>` element receives `class="dark"` when dark mode is active — all `dark:` classes respond to this.

### New Dependencies
- `next-themes` — theme provider, localStorage persistence, system preference detection

### Color Tokens

| Context | Light | Dark |
|---|---|---|
| Page background | `gray-50` | `slate-950` |
| Card / panel | `white` | `slate-900` |
| Header | `white` | `slate-900` |
| Border | `gray-200` | `slate-800` |
| Primary text | `slate-900` | `slate-100` |
| Muted text | `gray-500` | `slate-400` |
| Sidebar | `slate-900` (unchanged) | `slate-900` (unchanged) |

### globals.css Addition
```css
@custom-variant dark (&:where(.dark, .dark *));

html.dark {
  --background: #020617;
  --foreground: #f1f5f9;
}
```

### ThemeProvider Setup
Wrap `<html>` in `src/app/layout.tsx`:
```tsx
import { ThemeProvider } from 'next-themes'

// <html suppressHydrationWarning lang="en">
//   <body>
//     <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="twh-theme">
//       {children}
//     </ThemeProvider>
//   </body>
// </html>
```
`suppressHydrationWarning` is required — `next-themes` mutates the `<html>` class server-vs-client and React would otherwise warn.

### Toggle Placement
1. **Header bar** — sun/moon icon button (`Sun` / `Moon` from lucide-react) right of the user avatar. Cycles: light → dark → system.
2. **Settings page** — Theme row with three options: Light / Dark / System (radio/button group).

### Scope of File Changes
- `src/app/layout.tsx` — add `ThemeProvider` wrapper, `suppressHydrationWarning`
- `src/app/globals.css` — `@custom-variant dark`, `html.dark` CSS variable overrides
- `src/components/DashboardShell.tsx` — `dark:` classes on main area, header, borders; add toggle button
- `src/app/settings/page.tsx` — add Theme section
- All dashboard page components — bulk `dark:` additions to `bg-white`, `bg-gray-50`, `border-gray-200`, `text-slate-900`, `text-gray-500` patterns

---

## 2. Sidebar Restructure

### New Dependency
- `lucide-react` — icon library (tree-shakeable, ~1.5 kb per icon)

### Group Structure

```
OVERVIEW
  Dashboard        LayoutDashboard

WORK
  Time             Clock
  Projects         FolderKanban
  Calendar         CalendarDays
  Leave            Palmtree

FINANCE
  Expenses         Receipt
  Clients          Users
  Invoices         FileText
  Finance          TrendingUp        ← new page

ANALYTICS
  Insights         BarChart3
  Reports          FileBarChart2
  Activity         Activity

── divider ──
  Billing          CreditCard
  Download App     Download
  Help             HelpCircle
  Settings         Settings

── divider ──
  [avatar + email]
  [Sign out]
  Powered by Vividex
```

### Category Label Style
```
text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600
mt-6 mb-1 px-3
```
Category labels are non-interactive `<p>` elements — not links, not buttons.

### Nav Item Style (updated)
Each item: icon (16×16, `shrink-0`) + label. Active state unchanged (`border-cyan-400 bg-slate-800 text-cyan-400`).

```tsx
<Link className="flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium ...">
  <Icon size={16} className="shrink-0" />
  {label}
</Link>
```

### Files Changed
- `src/components/DashboardShell.tsx` — full rewrite of `NAV_ITEMS` to grouped structure, add icons, add category labels, add divider before account items

---

## 3. Finance / Revenue Section

### Database Migration
**File:** `supabase/schema-027-income-entries.sql`

```sql
create table income_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid references organisations(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  currency     text not null default 'AUD',
  category     text not null default 'Other',
  date         date not null,
  description  text,
  source_type  text not null default 'manual'
               check (source_type in ('manual', 'invoice')),
  invoice_id   uuid references invoices(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table income_entries enable row level security;

create policy "owner_all" on income_entries for all
  using (user_id = auth.uid());

create policy "org_manager_read" on income_entries for select
  using (
    org_id is not null and
    org_id in (
      select org_id from organisation_members
      where user_id = auth.uid() and role in ('owner','admin','manager')
    )
  );
```

`source_type` distinguishes manually logged income (`'manual'`) from entries auto-created when an invoice is marked paid (`'invoice'`). `invoice_id` links back to the originating invoice.

### Income Categories
`Sales`, `Consulting`, `Retainer`, `Reimbursement`, `Other`

### Page: `/dashboard/finance`

**Route:** `src/app/dashboard/finance/page.tsx` (server component)  
**Query params:** `?period=month|quarter|year|all` (default: `month`)

**Layout (top to bottom):**
1. Period selector row — This Month / This Quarter / This Year / All Time
2. Summary cards (3): Total Income · Total Expenses · Net
3. Monthly P&L chart — last 6 months, income (cyan) vs expenses (rose), pure CSS bars matching existing insights chart pattern
4. Income section — table of `income_entries` with `[+ Add Income]` button
5. Expenses section — table pulled from existing `expenses` table, `[→ View all]` link to `/dashboard/expenses`

**Summary card data sources:**
- Total Income: `sum(amount)` from `income_entries` for period
- Total Expenses: `sum(amount)` from `expenses` for period  
- Net: Income − Expenses (positive = green, negative = red)

### Components

| File | Type | Purpose |
|---|---|---|
| `src/app/dashboard/finance/page.tsx` | Server component | Data fetching, page layout |
| `src/components/finance/FinanceSummary.tsx` | Client component | 3 summary cards with period-aware totals |
| `src/components/finance/FinanceChart.tsx` | Client component | Monthly P&L bar chart (pure CSS) |
| `src/components/finance/IncomeList.tsx` | Client component | Income entries table, inline edit trigger |
| `src/components/finance/IncomeForm.tsx` | Client component | Add / edit income entry (inline panel, matching expense form pattern) |

### Invoice Integration
`src/app/api/invoices/[id]/mark-paid/route.ts` — when an invoice is marked paid, auto-insert a corresponding `income_entries` row:
- `source_type = 'invoice'`
- `invoice_id = <id>`
- `amount` = invoice total
- `date` = today
- `description` = invoice number + client name
- `category = 'Sales'`

This means paid invoices appear in the Finance page automatically without manual entry.

### Dark Mode
All finance components use `dark:` variants matching the token table in Section 1. Summary cards: `bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800`.

---

## Delivery Order

1. Install `lucide-react` + `next-themes`
2. Dark mode — `globals.css`, `layout.tsx`, `DashboardShell.tsx`, `settings/page.tsx`, bulk page updates
3. Sidebar restructure — `DashboardShell.tsx` NAV_ITEMS rewrite
4. Finance schema — `schema-027-income-entries.sql` (run in Supabase before deploying)
5. Finance components — `FinanceSummary`, `FinanceChart`, `IncomeList`, `IncomeForm`
6. Finance page — `src/app/dashboard/finance/page.tsx`
7. Invoice mark-paid integration — extend `src/app/api/invoices/[id]/mark-paid/route.ts`
8. `pnpm run build` — verify clean
