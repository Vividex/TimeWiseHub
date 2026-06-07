# Per-List Search / Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

> **Staging note:** Authored by Claude; Codex commits this + the spec into `docs/superpowers/`. Pure UI — no DB/RLS/migration. **Sequence after revenue-visibility** (both touch `ClientList`, `ExpenseList`, invoices page).

**Goal:** A client-side, as-you-type search box on 6 lists (clients, projects, tasks, expenses, employees, invoices), via a shared `SearchInput` + `useTextFilter`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4. pnpm. No backend changes.

---

## Verification approach
No test runner (intentional). `pnpm build` + `pnpm lint`; manual smoke per list (type substring → list narrows; clear → restores; no-match → "No matches"). Commit after each task.

---

### Task 1: Shared `useTextFilter` + `SearchInput`

**Files:** Create `src/lib/use-text-filter.ts`, `src/components/ui/SearchInput.tsx`

- [ ] **Step 1: Create the hook**
```ts
// src/lib/use-text-filter.ts
'use client'

import { useMemo, useState } from 'react'

export function useTextFilter<T>(items: T[], toText: (item: T) => string) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => toText(item).toLowerCase().includes(q))
  }, [items, query, toText])
  return { query, setQuery, filtered }
}
```

- [ ] **Step 2: Create the input**
```tsx
// src/components/ui/SearchInput.tsx
'use client'

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    />
  )
}
```

- [ ] **Step 3: Build + commit**
```bash
git add src/lib/use-text-filter.ts src/components/ui/SearchInput.tsx
git commit -m "feat(search): shared useTextFilter hook + SearchInput component"
```

---

### Task 2: Clients search (`ClientList.tsx`)

**Files:** Modify `src/components/clients/ClientList.tsx`

- [ ] **Step 1: Add imports**
```tsx
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
```

- [ ] **Step 2: Filter + render.** Replace the early `if (clients.length === 0)` return and the grid with a wrapper that includes the search box. Inside the component body, before the empty check:
```tsx
  const { query, setQuery, filtered } = useTextFilter(
    clients,
    c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`,
  )
```
Then render:
```tsx
  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search clients…" />
      {clients.length === 0 ? (
        <p className="text-sm font-semibold text-gray-400">No clients yet. Add your first client above.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm font-semibold text-gray-400">No matches.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map(c => (
            /* …existing client card markup, unchanged… */
          ))}
        </div>
      )}
    </div>
  )
```
(Keep the existing card markup; just iterate `filtered` instead of `clients`.)

- [ ] **Step 3: Build + commit**
```bash
git add src/components/clients/ClientList.tsx
git commit -m "feat(search): filter the clients list"
```

---

### Task 3: Expenses search (`ExpenseList.tsx`)

**Files:** Modify `src/components/expenses/ExpenseList.tsx`

Context: combine a text query with the existing `statusFilter`.

- [ ] **Step 1: Add imports** (as in Task 2).

- [ ] **Step 2: Add query + combine with status filter.** After the `statusFilter` state, add:
```tsx
  const { query, setQuery, filtered: textFiltered } = useTextFilter(
    expenses,
    e => `${e.description ?? ''} ${e.expense_categories?.name ?? ''} ${e.amount}`,
  )
```
Change the existing `filtered` to derive from `textFiltered`:
```tsx
  const filtered = statusFilter === 'all' ? textFiltered : textFiltered.filter(e => e.status === statusFilter)
```

- [ ] **Step 3: Render the input** next to the status select (inside the existing controls `div`):
```tsx
          <SearchInput value={query} onChange={setQuery} placeholder="Search expenses…" />
```

- [ ] **Step 4: Build + commit**
```bash
git add src/components/expenses/ExpenseList.tsx
git commit -m "feat(search): filter the expenses list"
```

---

### Task 4: Tasks search (`TaskList.tsx`)

**Files:** Modify `src/components/projects/TaskList.tsx`

Context: filter tasks by title/notes before the status grouping.

- [ ] **Step 1: Add imports** (as in Task 2).

- [ ] **Step 2: Filter before grouping.** After `const [tasks, setTasks] = useState(initialTasks)`, add:
```tsx
  const { query, setQuery, filtered } = useTextFilter(
    tasks,
    t => `${t.title} ${t.notes ?? ''}`,
  )
```
Change the `grouped` computation to use `filtered`:
```tsx
  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = filtered.filter(t => t.status === s)
    return acc
  }, {} as Record<string, Task[]>)
```

- [ ] **Step 3: Render the input** at the top of the returned `<div className="space-y-6">`:
```tsx
      <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" />
```

- [ ] **Step 4: Build + commit**
```bash
git add src/components/projects/TaskList.tsx
git commit -m "feat(search): filter tasks within a project"
```

---

### Task 5: Employees search (`OrgBillingSettingsForm.tsx`)

**Files:** Modify `src/components/OrgBillingSettingsForm.tsx`

Context: filter the members table by name/email/role.

- [ ] **Step 1: Add imports** (as in Task 2).

- [ ] **Step 2: Filter the members.** After the existing state, add:
```tsx
  const { query, setQuery, filtered: filteredMembers } = useTextFilter(
    initialMembers,
    m => `${m.profiles?.full_name ?? ''} ${m.profiles?.email ?? ''} ${m.role}`,
  )
```

- [ ] **Step 3: Render the input** above the members `<table>` (e.g., just before the `overflow-x-auto` wrapper), and map the table body over `filteredMembers` instead of `initialMembers`:
```tsx
      <SearchInput value={query} onChange={setQuery} placeholder="Search employees…" />
```
(Change `{initialMembers.map(member => {` → `{filteredMembers.map(member => {`. Note: the rate-saving `handleSave` still iterates `initialMembers`, which is correct — filtering is display-only.)

- [ ] **Step 4: Build + commit**
```bash
git add src/components/OrgBillingSettingsForm.tsx
git commit -m "feat(search): filter the employees (org members) table"
```

---

### Task 6: Projects search (client wrapper)

**Files:** Create `src/components/projects/ProjectsGrid.tsx`; Modify `src/app/dashboard/projects/page.tsx`

Context: the projects page renders `ProjectCard`s server-side. Add a small client wrapper holding the active projects + search. (Searchable by `name`; the projects query doesn't join the client, so v1 searches the project name — note this in the wrapper.)

- [ ] **Step 1: Create the wrapper**
```tsx
// src/components/projects/ProjectsGrid.tsx
'use client'

import ProjectCard from '@/components/projects/ProjectCard'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Project = any

export default function ProjectsGrid({ projects }: { projects: Project[] }) {
  const { query, setQuery, filtered } = useTextFilter(projects, p => `${p.name ?? ''}`)

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" />
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No matches.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
```
> If `ProjectCard` uses any server-only API it can't render inside a client component — verify it's a plain/presentational component (it renders project props, so it should be fine). If not, fall back to keeping the grid server-side and rendering only the `SearchInput`-driven filter via a different approach.

- [ ] **Step 2: Wire the active section.** In `projects/page.tsx`, import `ProjectsGrid` and replace the active-projects block:
```tsx
import ProjectsGrid from '@/components/projects/ProjectsGrid'
```
Replace the active `{active.length === 0 ? (…) : (<div className="grid …">{active.map(...)}</div>)}` with:
```tsx
          {active.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No active projects. Create one above.</p>
          ) : (
            <ProjectsGrid projects={active} />
          )}
```
(Leave the archived section unchanged.)

- [ ] **Step 3: Build + commit**
```bash
git add src/components/projects/ProjectsGrid.tsx src/app/dashboard/projects/page.tsx
git commit -m "feat(search): filter the active projects list"
```

---

### Task 7: Invoices search (client wrapper)

**Files:** Create `src/components/invoices/InvoiceTable.tsx`; Modify `src/app/dashboard/invoices/page.tsx`

Context: the invoices table is server-rendered. Extract the table (not the summary cards) into a client wrapper with search. Searchable by invoice number, client name, status.

- [ ] **Step 1: Create the wrapper** — move the table markup into a client component that takes the invoice rows.
```tsx
// src/components/invoices/InvoiceTable.tsx
'use client'

import Link from 'next/link'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type InvoiceRow = {
  id: string; invoice_number: string; status: string
  issue_date: string; due_date: string | null
  subtotal: number; currency: string
  clients: { name: string } | { name: string }[] | null
}

function clientName(c: InvoiceRow['clients']): string {
  return Array.isArray(c) ? (c[0]?.name ?? '') : (c?.name ?? '')
}

export default function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  const { query, setQuery, filtered } = useTextFilter(
    invoices,
    i => `${i.invoice_number} ${clientName(i.clients)} ${i.status}`,
  )

  if (invoices.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-gray-400">No invoices yet.</p>
        <Link href="/dashboard/invoices/new" className="mt-3 inline-block text-sm font-bold text-cyan-600 hover:underline">Create your first invoice →</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="p-4"><SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" /></div>
      {filtered.length === 0 ? (
        <p className="px-5 pb-6 text-sm font-semibold text-gray-400">No matches.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Invoice</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Client</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Issued</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Due</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
              <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4"><Link href={`/dashboard/invoices/${inv.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{inv.invoice_number}</Link></td>
                <td className="px-5 py-4 text-gray-600">{clientName(inv.clients) || '—'}</td>
                <td className="px-5 py-4 text-gray-500">{fmtDate(inv.issue_date)}</td>
                <td className="px-5 py-4 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                <td className="px-5 py-4 text-right font-bold text-gray-900">{inv.currency} {Number(inv.subtotal).toFixed(2)}</td>
                <td className="px-5 py-4 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[inv.status]}`}>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Use it in the page.** In `invoices/page.tsx`, import `InvoiceTable` and replace the entire invoice-list `<div className="… overflow-hidden">…</div>` block (the conditional table) with:
```tsx
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <InvoiceTable invoices={(invoices ?? []) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]} />
        </div>
```
(Keep the summary cards + the page's data fetch unchanged. Remove the now-unused `STATUS_STYLE`/`fmtDate` from the page if they cause lint unused-var errors.)

- [ ] **Step 3: Build + lint + commit**
```bash
git add src/components/invoices/InvoiceTable.tsx src/app/dashboard/invoices/page.tsx
git commit -m "feat(search): filter the invoices list"
```

---

### Task 8: Final verification + docs

**Files:** Create `docs/superpowers/specs/2026-06-07-list-search-design.md` + `docs/superpowers/plans/2026-06-07-list-search.md` (from staging)

- [ ] **Step 1: Full build + lint** — `pnpm build` && `pnpm lint`.
- [ ] **Step 2: Manual smoke** — each of the 6 lists: typing filters live; clearing restores; non-matching shows "No matches".
- [ ] **Step 3: Copy staged docs + commit**
```bash
git add docs/superpowers/specs/2026-06-07-list-search-design.md docs/superpowers/plans/2026-06-07-list-search.md
git commit -m "docs(search): per-list search design spec + implementation plan"
```
- [ ] **Step 4: Push** — `git push origin master`.

---

## Self-Review

**1. Spec coverage:** shared hook+input → Task 1; clients/expenses/tasks/employees/projects/invoices → Tasks 2-7. Client-side, as-you-type, substring, "No matches" state → each task. No DB changes. ✓

**2. Placeholder scan:** none. Each list keeps its existing empty state and adds a distinct "No matches".

**3. Type consistency:** `useTextFilter`/`SearchInput` (Task 1) imported identically everywhere. Accessors are inline arrows (recompute is negligible at list sizes). `InvoiceRow` exported from the wrapper and used by the page. Existing handlers (expense submit/delete, member rate save) still operate on the full source arrays — filtering is display-only, so no logic breaks.

---

## Notes for the executor
- **Run after revenue-visibility** — Tasks 2 & 3 & 7 edit files that plan also touches (`ClientList`, `ExpenseList`, invoices page). Sequencing avoids conflicts.
- Pure presentational change — no migration, no RLS, no queries.
- If `ProjectCard` (Task 6) turns out to use server-only APIs, keep the grid server-rendered and revisit; it should be a plain component.
