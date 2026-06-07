# Per-List Search / Filter — Design

> **Staging note:** Authored by Claude. Codex commits to `docs/superpowers/specs/...` and makes all file changes in `C:/GameForge/timewisehub`. Pure UI; no DB changes, no RLS, no migration.

**Goal:** Let users quickly find items in long lists. Each major list page gets a search box that filters that list **as you type**, client-side. Solves "too many to scroll" across clients, projects, tasks, expenses, employees, and invoices.

**Architecture:** These lists already load their rows fully, so filtering happens **in the browser** — instant, no new queries. Two shared pieces — a `SearchInput` component and a `useTextFilter` hook — are reused by every list for consistency and DRY. Server-rendered lists get a thin client wrapper so the filter can run client-side.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4. pnpm. No backend changes.

---

## Scope

**In scope (v1):** a reusable `SearchInput` + `useTextFilter`; a search box wired into 6 lists (clients, projects, tasks, expenses, employees, invoices), each filtering on sensible text fields, client-side, as-you-type.

**Out of scope:** global ⌘K omnisearch (planned **v2**); server-side/paginated/`ilike` search (only needed once a list is too large to load at once); fuzzy ranking (v1 is substring match).

---

## Locked decisions
- **Per-list** filtering (not global) for v1.
- **Client-side**, **search-as-you-type**, **substring (case-insensitive) match**.
- 6 target lists; global omnisearch deferred to v2.

---

## Shared components

### `useTextFilter` hook
```ts
// src/lib/use-text-filter.ts
'use client'

import { useMemo, useState } from 'react'

/**
 * Client-side as-you-type filter. `toText` should be a stable function
 * (module-level or useCallback) returning the searchable text for an item.
 */
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

### `SearchInput` component
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

**Integration pattern (per list):** in the list's **client** component, call `useTextFilter(items, accessor)`, render `<SearchInput value={query} onChange={setQuery} />` above the list, and map over `filtered` instead of the raw array. The `accessor` is a stable function building one lowercase-able string from the item's searchable fields. Show a "No matches" state when `filtered` is empty but `items` isn't.

---

## Target lists + searchable fields

| List | Component (confirm at plan time) | Client/server today | Searchable fields |
|---|---|---|---|
| Clients | `src/components/clients/ClientList.tsx` | client | name, email, phone |
| Projects | `src/app/dashboard/projects/page.tsx` (+ list component) | confirm | name, client name |
| Tasks | `src/components/projects/TaskList.tsx` | client | title |
| Expenses | `src/components/expenses/ExpenseList.tsx` | client | description, category, amount |
| Employees | `src/components/OrgBillingSettingsForm.tsx` (members table) | client | name, email, role |
| Invoices | `src/app/dashboard/invoices/page.tsx` | **server** → needs thin client wrapper | invoice number, client name, status |

**Server-rendered lists** (e.g., invoices): extract the table into a small `'use client'` component that receives the rows as a prop and applies `useTextFilter` — the server page keeps fetching and just renders the wrapper.

---

## Error / edge handling
- Empty query → full list (no filtering).
- Query with no matches → "No matches" message (distinct from the list's existing "nothing yet" empty state).
- Filtering never mutates data or fires queries; it's display-only.

---

## Verification
No test runner (intentional). `pnpm build` + `pnpm lint`. Manual smoke: on each of the 6 lists, type a substring → the list narrows live; clearing restores it; a non-matching string shows "No matches".

---

## Files
- Create: `src/lib/use-text-filter.ts`
- Create: `src/components/ui/SearchInput.tsx`
- Modify: `src/components/clients/ClientList.tsx`
- Modify: projects list (component confirmed at plan time)
- Modify: `src/components/projects/TaskList.tsx`
- Modify: `src/components/expenses/ExpenseList.tsx`
- Modify: `src/components/OrgBillingSettingsForm.tsx` (members table)
- Create + Modify: invoices client wrapper + `src/app/dashboard/invoices/page.tsx`

---

## Plan-time confirmations (read each before wiring)
1. Exact prop/data shape of each list component and whether it's client or server.
2. The projects list component path/shape (page may render inline or via a component).
3. Whether `OrgBillingSettingsForm` is the right "employees" surface or a dedicated list is preferred.
4. For invoices, factor the table into a client wrapper without changing the summary cards.

## Notes
- This is **v1 (per-list)**. A future **v2** global ⌘K omnisearch would add a unified search surface (and likely server-side queries per entity) — out of scope here, but the per-list accessors defined now are reusable inputs for it.
