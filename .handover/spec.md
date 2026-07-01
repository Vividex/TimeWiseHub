# Programs Phase 4 — Link a Program to a Session

## Goal
Let a user attach one Program to a Session, then browse that Program's categories and assets
from a read-only slide-over drawer on the session detail page.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-01-programs-phase4-session-link-design.md`
- Source plan: `docs/superpowers/plans/2026-07-01-programs-phase4-session-link.md`
- One nullable `program_id` FK on `sessions` (`on delete set null`). No RLS changes — existing
  `sessions` policies already cover this column.
- Linking/unlinking uses the direct browser-Supabase-client mutation pattern already used
  throughout `SessionDetailClient.tsx` (`supabase.from('sessions').update(...)`) — no new API
  route, and no new client-side role gating (matches the existing file's convention of relying on
  RLS, same as Delete Session / todo edits today).
- Programs data (categories/assets/signed URLs) is read server-side via the service client,
  mirroring `src/app/dashboard/programs/[id]/page.tsx` exactly.
- Program picker lists only `program.org_id === session.org_id`, filtered client-side from the
  existing unmodified `GET /api/programs`.
- The read-only drawer reuses `CategoryTree`/`AssetGrid` unmodified with `canManage={false}` —
  zero changes to Phase 1 components.
- Codex handles text edits only; conductor (Claude) runs all shell/build/git and the DB migration
  via Supabase MCP (Windows: Codex's workspace-write sandbox cannot spawn subprocesses).
- Verification gate: `pnpm run build` (tsc + eslint) after every turn. No test runner.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (no Codex dispatch needed) — DB migration via Supabase MCP.
- C-5 needs a manual browser smoke test (no test runner) before ticking it done.

---

## C-1 — Database migration

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-073-session-program-link.sql`:
  ```sql
  alter table public.sessions
    add column program_id uuid references public.programs(id) on delete set null;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `session-program-link`)
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'program_id';
  ```
  Expected: 1 row, `data_type = uuid`, `is_nullable = YES`.
- [x] Commit: `git add supabase/schema-073-session-program-link.sql && git commit -m "feat: programs phase 4 — link sessions to a program (DB migration)"`

---

## C-2 — Extract shared category-tree builder

*Codex edits:*
- [x] Create `src/lib/programs/build-tree.ts`:
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
- [x] Edit `src/components/programs/ProgramExplorer.tsx`:
  - Remove the local `buildTree` function definition.
  - Add `import { buildCategoryTree } from '@/lib/programs/build-tree'`.
  - Replace `const tree = buildTree(localCategories)` with `const tree = buildCategoryTree(localCategories)`.

*Conductor:*
- [x] `pnpm run build` — must pass clean (pure refactor, no visual change).
- [x] Commit: `git add src/lib/programs/build-tree.ts src/components/programs/ProgramExplorer.tsx && git commit -m "refactor: extract buildCategoryTree into shared helper"`

---

## C-3 — Fetch linked program data on session detail page

*Codex edits:*
- [x] Edit `src/types/programs.ts` — append:
  ```typescript

  export type LinkedProgramBundle = {
    program: Program
    categories: ProgramCategory[]
    assets: ProgramAsset[]
  }
  ```
- [x] Replace `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` in full:
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
- [x] Edit `src/components/clients/SessionDetailClient.tsx` — thread the new prop through (no UI change yet):
  - Add `import type { LinkedProgramBundle } from '@/types/programs'`.
  - In the component's destructured props and type signature, add `linkedProgram,` and
    `linkedProgram: LinkedProgramBundle | null` respectively (alongside the existing `orgId`).

*Conductor:*
- [x] `pnpm run build` — must pass clean. No visible UI change yet (prop is unused until C-5).
- [x] Commit: `git add src/types/programs.ts src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx src/components/clients/SessionDetailClient.tsx && git commit -m "feat: programs phase 4 — fetch linked program data on session detail page"`

---

## C-4 — LinkedProgramDrawer (read-only viewer)

*Codex edits:*
- [ ] Create `src/components/programs/LinkedProgramDrawer.tsx`:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean (component not yet imported anywhere, checks it compiles standalone).
- [ ] Commit: `git add src/components/programs/LinkedProgramDrawer.tsx && git commit -m "feat: programs phase 4 — read-only LinkedProgramDrawer"`

---

## C-5 — SessionProgramLink (picker, link/unlink, drawer trigger)

*Codex edits:*
- [ ] Create `src/components/clients/SessionProgramLink.tsx`:
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
- [ ] Edit `src/components/clients/SessionDetailClient.tsx`:
  - Add `import SessionProgramLink from '@/components/clients/SessionProgramLink'`.
  - Inside the header's `<div className="flex flex-wrap items-center gap-2">` (the one wrapping the
    status badge, "Mark as..." button, and delete controls), insert
    `<SessionProgramLink sessionId={initial.id} orgId={orgId} linkedProgram={linkedProgram} />`
    as the FIRST child, directly before the `<span className={...STATUS_STYLE...}>` status badge.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual browser smoke test (no test runner):
  1. Open a session detail page for an org with at least one program.
  2. "Link program" → picker opens, org-scoped programs only.
  3. Pick one → badge + View/Change/Unlink controls appear.
  4. "View" → drawer slides in, shows categories/assets, zero edit/upload/delete controls.
  5. Click a category → asset grid filters.
  6. "Unlink" → badge disappears, "Link program" returns.
- [ ] Commit: `git add src/components/clients/SessionProgramLink.tsx src/components/clients/SessionDetailClient.tsx && git commit -m "feat: programs phase 4 — link/unlink program control and reference drawer on session page"`

---

## Acceptance checklist
- [x] C-1: `sessions.program_id` column exists, migration file committed
- [x] C-2: `buildCategoryTree` extracted and reused by `ProgramExplorer`, build passes
- [x] C-3: session detail server page fetches and passes `linkedProgram` bundle
- [ ] C-4: `LinkedProgramDrawer` renders `CategoryTree`/`AssetGrid` read-only, build passes
- [ ] C-5: link/unlink/change control works end-to-end, verified manually in the browser

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-5 (no test runner in this project).
