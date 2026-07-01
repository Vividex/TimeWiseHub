# Programs Phase 4 — Link a Program to a Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach one Program to a Session, then browse that Program's categories and assets from a read-only slide-over drawer on the session detail page.

**Architecture:** One nullable `program_id` FK on `sessions`. The session detail server page fetches the linked program's categories/assets (with signed URLs) the same way the Programs explorer page already does, and passes the bundle to a new `SessionProgramLink` client component that owns the link/unlink/picker UI and renders a `LinkedProgramDrawer` that reuses the existing `CategoryTree`/`AssetGrid` components in read-only mode (`canManage={false}` — no changes needed to those components).

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr` + service client + browser client), Lucide React icons. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages.
- Migration file saved as `supabase/schema-NNN-name.sql`. Next available: `073`. Applied via Supabase MCP `apply_migration`.
- Supabase project ID: `sdwwlnnsijcadkdwsvud`.
- All Tailwind classes must include `dark:` variants. Pattern: `bg-white dark:bg-slate-900`, `border-gray-100 dark:border-slate-800`, `text-gray-900 dark:text-slate-100`, `text-gray-500 dark:text-slate-400`.
- Session mutations (`sessions` table) go through the browser Supabase client directly (`supabase.from('sessions').update(...)`), matching the existing pattern in `SessionDetailClient.tsx` — no new API route for linking/unlinking. RLS on `sessions` already restricts writes to org owner/admin/manager; this component does not add its own client-side role gating (matching the existing file's convention — Delete Session, todo edits, etc. are all shown unconditionally and rely on RLS).
- Programs data (categories/assets/signed URLs) is read via the service client on the server, following the exact pattern in `src/app/dashboard/programs/[id]/page.tsx`.
- The picker only lists programs where `program.org_id === session's org_id` — filtered client-side after calling the existing unmodified `GET /api/programs`.

---

## File Map

**New files:**
```
supabase/schema-073-session-program-link.sql
src/lib/programs/build-tree.ts
src/components/programs/LinkedProgramDrawer.tsx
src/components/clients/SessionProgramLink.tsx
```

**Modified files:**
```
src/types/programs.ts                                          — add LinkedProgramBundle type
src/components/programs/ProgramExplorer.tsx                    — use shared buildCategoryTree helper
src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx   — fetch + pass linkedProgram bundle
src/components/clients/SessionDetailClient.tsx                 — render SessionProgramLink
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/schema-073-session-program-link.sql`
- [CONDUCTOR] Apply via Supabase MCP

**Interfaces:**
- Produces: `sessions.program_id` column (nullable uuid FK → `programs.id`)

- [ ] **Step 1: Write migration file**

```sql
-- supabase/schema-073-session-program-link.sql
-- Programs Phase 4: link a session to a reference program

alter table public.sessions
  add column program_id uuid references public.programs(id) on delete set null;
```

- [ ] **Step 2: Apply migration [CONDUCTOR — run via Supabase MCP apply_migration]**

  Name: `session-program-link`
  SQL: the content of `supabase/schema-073-session-program-link.sql`

- [ ] **Step 3: Verify column exists [CONDUCTOR]**

  Run via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'program_id';
  ```
  Expected: 1 row, `data_type = uuid`, `is_nullable = YES`.

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/schema-073-session-program-link.sql
  git commit -m "feat: programs phase 4 — link sessions to a program (DB migration)"
  ```

---

## Task 2: Extract shared category-tree builder

Both `ProgramExplorer` (existing) and the new `LinkedProgramDrawer` (Task 4) need to turn a flat `ProgramCategory[]` into a nested `CategoryNode[]` tree. `ProgramExplorer.tsx` currently has this logic as an unexported local function — pull it into a shared helper so it isn't duplicated.

**Files:**
- Create: `src/lib/programs/build-tree.ts`
- Modify: `src/components/programs/ProgramExplorer.tsx`

**Interfaces:**
- Produces: `buildCategoryTree(categories: ProgramCategory[]): CategoryNode[]`
- Consumed by: `ProgramExplorer.tsx` (this task), `LinkedProgramDrawer.tsx` (Task 4)

- [ ] **Step 1: Create the shared helper**

Create `src/lib/programs/build-tree.ts`:

```typescript
import type { ProgramCategory, CategoryNode } from '@/types/programs'

export function buildCategoryTree(categories: ProgramCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  categories.forEach(c => map.set(c.id, { ...c, children: [] }))
  const roots: CategoryNode[] = []
  categories.forEach(c => {
    if (c.parent_id) {
      map.get(c.parent_id)?.children.push(map.get(c.id)!)
    } else {
      roots.push(map.get(c.id)!)
    }
  })
  return roots
}
```

- [ ] **Step 2: Update ProgramExplorer to use the shared helper**

In `src/components/programs/ProgramExplorer.tsx`:

Remove the local `buildTree` function (lines 10-22 — the whole function definition) and its now-unused imports stay the same. Add an import:

```typescript
import { buildCategoryTree } from '@/lib/programs/build-tree'
```

Replace the call site:

```typescript
  const tree = buildTree(localCategories)
```

with:

```typescript
  const tree = buildCategoryTree(localCategories)
```

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. This confirms `ProgramExplorer` still renders identically (Programs Phase 1 explorer is unaffected — pure refactor).

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/programs/build-tree.ts src/components/programs/ProgramExplorer.tsx
  git commit -m "refactor: extract buildCategoryTree into shared helper"
  ```

---

## Task 3: Fetch linked program data on the session detail page

**Files:**
- Modify: `src/types/programs.ts`
- Modify: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- Modify: `src/components/clients/SessionDetailClient.tsx` (prop plumbing only — no UI changes yet)

**Interfaces:**
- Produces: `LinkedProgramBundle` type; `linkedProgram: LinkedProgramBundle | null` prop threaded into `SessionDetailClient`
- Consumed by: Task 5 (`SessionProgramLink`)

- [ ] **Step 1: Add the `LinkedProgramBundle` type**

In `src/types/programs.ts`, append at the end of the file:

```typescript

export type LinkedProgramBundle = {
  program: Program
  categories: ProgramCategory[]
  assets: ProgramAsset[]
}
```

- [ ] **Step 2: Fetch the bundle in the session detail server page**

Replace the full contents of `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`:

```typescript
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { createProgramAssetSignedUrl } from '@/lib/program-storage'
import SessionDetailClient from '@/components/clients/SessionDetailClient'
import type { LinkedProgramBundle, Program, ProgramAsset } from '@/types/programs'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: session }, { data: client }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!session || !client) notFound()

  const todos = (session.session_todos as { id: string; title: string; completed: boolean; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position)

  let linkedProgram: LinkedProgramBundle | null = null

  if (session.program_id) {
    const service = createServiceClient()
    const { data: program } = await service
      .from('programs').select('*').eq('id', session.program_id).maybeSingle()

    if (program) {
      const { data: membership } = await service
        .from('organisation_members').select('role')
        .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
      const isOwner = program.owner_id === user.id
      const isMember = !!membership

      if (isOwner || isMember) {
        const [{ data: categories }, { data: assets }] = await Promise.all([
          service.from('program_categories').select('*')
            .eq('program_id', program.id).order('sort_order').order('created_at'),
          service.from('program_assets').select('*')
            .eq('program_id', program.id).order('sort_order').order('created_at'),
        ])

        const assetsWithUrls: ProgramAsset[] = await Promise.all(
          (assets ?? []).map(async asset => {
            if (asset.storage_path) {
              const signed_url = await createProgramAssetSignedUrl(asset.storage_path)
              return { ...asset, signed_url }
            }
            return { ...asset, signed_url: null }
          }),
        )

        linkedProgram = {
          program: program as Program,
          categories: categories ?? [],
          assets: assetsWithUrls,
        }
      }
    }
  }

  return (
    <SessionDetailClient
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
      }}
      todos={todos}
      clientId={id}
      clientName={client.name}
      orgId={session.org_id}
      linkedProgram={linkedProgram}
    />
  )
}
```

- [ ] **Step 3: Thread the prop through SessionDetailClient (no UI change yet)**

In `src/components/clients/SessionDetailClient.tsx`, update the props destructuring and type signature. Change:

```typescript
export default function SessionDetailClient({
  session: initial,
  todos: initialTodos,
  clientId,
  clientName,
  orgId,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
  orgId: string | null
}) {
```

to:

```typescript
export default function SessionDetailClient({
  session: initial,
  todos: initialTodos,
  clientId,
  clientName,
  orgId,
  linkedProgram,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
}) {
```

Add the import at the top of the file, alongside the existing imports:

```typescript
import type { LinkedProgramBundle } from '@/types/programs'
```

`linkedProgram` is unused in this component until Task 5 — that's fine, TypeScript won't flag an unused destructured prop.

- [ ] **Step 4: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. The session page now fetches program data server-side but nothing renders it yet — no visible change in the browser.

- [ ] **Step 5: Commit**

  ```bash
  git add src/types/programs.ts src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx src/components/clients/SessionDetailClient.tsx
  git commit -m "feat: programs phase 4 — fetch linked program data on session detail page"
  ```

---

## Task 4: LinkedProgramDrawer (read-only viewer)

**Files:**
- Create: `src/components/programs/LinkedProgramDrawer.tsx`

**Interfaces:**
- Consumes: `buildCategoryTree` (Task 2), `CategoryTree`, `AssetGrid` (existing, unmodified)
- Produces: `LinkedProgramDrawer` component, consumed by `SessionProgramLink` (Task 5)

- [ ] **Step 1: Write the drawer component**

Create `src/components/programs/LinkedProgramDrawer.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import CategoryTree from '@/components/programs/CategoryTree'
import AssetGrid from '@/components/programs/AssetGrid'
import { buildCategoryTree } from '@/lib/programs/build-tree'
import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

const NOOP_CATEGORY = () => {}
const NOOP_ASSET = () => {}

export default function LinkedProgramDrawer({
  program,
  categories,
  assets,
  onClose,
}: {
  program: Program
  categories: ProgramCategory[]
  assets: ProgramAsset[]
  onClose: () => void
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const tree = buildCategoryTree(categories)
  const visibleAssets =
    selectedCategoryId === null
      ? assets
      : assets.filter(a => a.category_id === selectedCategoryId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: program.cover_colour }}
            >
              <FolderOpen size={14} />
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{program.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
            <CategoryTree
              programId={program.id}
              tree={tree}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
              canManage={false}
              onCategoryAdded={NOOP_CATEGORY}
              onCategoryDeleted={NOOP_CATEGORY}
            />
          </aside>

          <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-slate-950">
            <AssetGrid
              programId={program.id}
              assets={visibleAssets}
              selectedCategoryId={selectedCategoryId}
              canManage={false}
              onAssetAdded={NOOP_ASSET}
              onAssetDeleted={NOOP_ASSET}
              onAssetUpdated={NOOP_ASSET}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. `LinkedProgramDrawer` isn't imported anywhere yet, so this only checks it compiles standalone.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/programs/LinkedProgramDrawer.tsx
  git commit -m "feat: programs phase 4 — read-only LinkedProgramDrawer"
  ```

---

## Task 5: SessionProgramLink (picker, link/unlink, drawer trigger)

**Files:**
- Create: `src/components/clients/SessionProgramLink.tsx`
- Modify: `src/components/clients/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `LinkedProgramDrawer` (Task 4), `GET /api/programs` (existing, unmodified)
- Produces: rendered control on the session detail page

- [ ] **Step 1: Write the SessionProgramLink component**

Create `src/components/clients/SessionProgramLink.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Library, Eye, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import LinkedProgramDrawer from '@/components/programs/LinkedProgramDrawer'
import type { LinkedProgramBundle, Program } from '@/types/programs'

export default function SessionProgramLink({
  sessionId,
  orgId,
  linkedProgram,
}: {
  sessionId: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [showPicker, setShowPicker] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [options, setOptions] = useState<Program[] | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [linking, setLinking] = useState(false)

  async function openPicker() {
    setShowPicker(true)
    if (options !== null) return
    setLoadingOptions(true)
    const res = await fetch('/api/programs')
    const all: Program[] = res.ok ? await res.json() : []
    setOptions(all.filter(p => p.org_id === orgId))
    setLoadingOptions(false)
  }

  async function linkProgram(programId: string) {
    setLinking(true)
    await supabase.from('sessions').update({ program_id: programId }).eq('id', sessionId)
    setLinking(false)
    setShowPicker(false)
    router.refresh()
  }

  async function unlinkProgram() {
    await supabase.from('sessions').update({ program_id: null }).eq('id', sessionId)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      {linkedProgram ? (
        <>
          <span
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: linkedProgram.program.cover_colour }}
            />
            {linkedProgram.program.name}
          </span>
          <button
            type="button"
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Eye size={12} />
            View
          </button>
          <button
            type="button"
            onClick={openPicker}
            className="text-xs font-semibold text-cyan-600 hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={unlinkProgram}
            className="text-xs font-semibold text-red-500 hover:underline"
          >
            Unlink
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Library size={12} />
          Link program
        </button>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Link a program</h2>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            {loadingOptions && (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">Loading…</p>
            )}

            {!loadingOptions && options !== null && options.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No programs available for this organisation yet.
              </p>
            )}

            {!loadingOptions && options !== null && options.length > 0 && (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {options.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={linking}
                    onClick={() => linkProgram(p.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.cover_colour }} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showDrawer && linkedProgram && (
        <LinkedProgramDrawer
          program={linkedProgram.program}
          categories={linkedProgram.categories}
          assets={linkedProgram.assets}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render it on the session detail page**

In `src/components/clients/SessionDetailClient.tsx`, add the import:

```typescript
import SessionProgramLink from '@/components/clients/SessionProgramLink'
```

Find the header block containing the status badge and delete button (the `<div className="flex flex-wrap items-center gap-2">` that wraps the status span, "Mark as..." button, and delete controls). Add `SessionProgramLink` immediately before that div, inside the same parent flex container, so it sits alongside them:

```typescript
            <div className="flex flex-wrap items-center gap-2">
              <SessionProgramLink
                sessionId={initial.id}
                orgId={orgId}
                linkedProgram={linkedProgram}
              />
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
```

(This replaces the line `<span className={...STATUS_STYLE...}>` — insert the `SessionProgramLink` block directly above it, keeping everything else in that div unchanged.)

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors.

- [ ] **Step 4: Manual smoke test**

  Since there's no test runner, verify in the browser:
  1. Open a client's session detail page (`/dashboard/clients/[id]/sessions/[sessionId]`) for an org that has at least one program.
  2. Click "Link program" — picker opens, lists org-scoped programs only.
  3. Pick one — picker closes, page refreshes, the program name badge + "View"/"Change"/"Unlink" controls appear.
  4. Click "View" — drawer slides in from the right showing the program's categories and assets, with no add/upload/delete controls visible anywhere (read-only).
  5. Click a category — asset grid filters to that category.
  6. Close the drawer, click "Unlink" — badge disappears, "Link program" button returns.
  7. Confirm a session with no org (if any exist) shows no crash — `orgId` may be `null`, in which case the picker should show "No programs available" (since `p.org_id === null` only matches solo programs with no org, which is fine — it's simply an edge case with likely zero results, not an error).

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/clients/SessionProgramLink.tsx src/components/clients/SessionDetailClient.tsx
  git commit -m "feat: programs phase 4 — link/unlink program control and reference drawer on session page"
  ```

---

## Acceptance checklist
- [ ] Task 1: `sessions.program_id` column exists, migration file committed
- [ ] Task 2: `buildCategoryTree` extracted and reused by `ProgramExplorer`, build passes
- [ ] Task 3: session detail server page fetches and passes `linkedProgram` bundle
- [ ] Task 4: `LinkedProgramDrawer` renders `CategoryTree`/`AssetGrid` read-only, build passes
- [ ] Task 5: link/unlink/change control works end-to-end, verified manually in the browser

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser smoke test required for Task 5 (role/session behavior — no test runner in this project).
