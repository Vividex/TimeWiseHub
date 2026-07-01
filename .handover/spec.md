# Programs Phase 3 — Template Builder

## Goal
Let a user flag a Program as a template, browse templates separately from regular Programs, and
clone a program's category structure (plus note/link content) into a brand-new, independent
Program — in either direction (program → template, or template → program).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-01-programs-phase3-templates-design.md`
- Source plan: `docs/superpowers/plans/2026-07-01-programs-phase3-templates.md`
- One boolean column (`programs.is_template`), no new tables. Templates are edited with the
  exact same `ProgramExplorer` already shipped in Phase 1 — no new authoring UI.
- One new endpoint `POST /api/programs/[id]/duplicate` powers all three UI entry points
  (Save as template, Use template, and the New template button indirectly via ProgramForm).
- Duplicating only requires **view** access to the source (owner or org member) — it creates a
  new object, doesn't mutate the source.
- Only `note`/`link` asset types get copied on clone. File-based types (pdf/docx/xlsx/image/audio/
  video) are never copied — avoids Storage duplication cost and a shared-`storage_path` delete
  hazard (deleting one copy's row would delete the file out from under the other).
- `GET /api/programs` gains an optional `?is_template=true` filter; default (no param) stays
  `false` so every existing caller (dashboard's programs list, Phase 4's session-link picker)
  is unaffected.
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
- C-6 needs a manual browser smoke test (no test runner) before ticking it done.

---

## C-1 — Database migration

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-074-program-templates.sql`:
  ```sql
  alter table public.programs
    add column is_template boolean not null default false;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `program_templates`)
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'programs' and column_name = 'is_template';
  ```
  Expected: 1 row, `data_type = boolean`, `column_default = false`, `is_nullable = NO`.
- [x] Commit: `git add supabase/schema-074-program-templates.sql && git commit -m "feat: programs phase 3 — is_template column (DB migration)"`

---

## C-2 — Types + duplicate endpoint + GET/POST extension

*Codex edits:*
- [x] Edit `src/types/programs.ts` — add `is_template: boolean` to the `Program` type:
  ```typescript
  export type Program = {
    id: string
    org_id: string | null
    owner_id: string | null
    name: string
    description: string | null
    cover_colour: string
    icon: string
    is_archived: boolean
    is_template: boolean
    created_at: string
    updated_at: string
  }
  ```
- [x] Replace `src/app/api/programs/route.ts` in full:
  ```typescript
  import { NextResponse } from 'next/server'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'

  export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const isTemplate = url.searchParams.get('is_template') === 'true'

    const service = createServiceClient()
    const { data: membership } = await service
      .from('organisation_members').select('org_id')
      .eq('user_id', user.id).maybeSingle()
    const orgId = membership?.org_id ?? null

    const query = orgId
      ? service.from('programs')
          .select('*')
          .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
          .eq('is_archived', false)
          .eq('is_template', isTemplate)
          .order('created_at', { ascending: false })
      : service.from('programs')
          .select('*')
          .eq('owner_id', user.id)
          .eq('is_archived', false)
          .eq('is_template', isTemplate)
          .order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, description, cover_colour, icon, org_id, is_template } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const service = createServiceClient()

    if (org_id) {
      const { data: membership } = await service
        .from('organisation_members').select('role')
        .eq('user_id', user.id).eq('org_id', org_id).maybeSingle()
      if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data, error } = await service.from('programs').insert({
      owner_id: user.id,
      org_id: org_id ?? null,
      name: name.trim(),
      description: description?.trim() || null,
      cover_colour: cover_colour || '#06b6d4',
      icon: icon || 'library',
      is_template: !!is_template,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }
  ```
- [x] Create `src/app/api/programs/[id]/duplicate/route.ts`:
  ```typescript
  import { NextResponse } from 'next/server'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import { buildCategoryTree } from '@/lib/programs/build-tree'
  import type { CategoryNode, ProgramCategory } from '@/types/programs'

  export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, is_template } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const service = createServiceClient()
    const { data: source } = await service.from('programs').select('*').eq('id', id).maybeSingle()
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: membership } = await service
      .from('organisation_members').select('role')
      .eq('user_id', user.id).eq('org_id', source.org_id ?? '').maybeSingle()
    const isOwner = source.owner_id === user.id
    const isMember = !!membership
    if (!isOwner && !isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: newProgram, error: programError } = await service.from('programs').insert({
      owner_id: user.id,
      org_id: source.org_id,
      name: name.trim(),
      description: source.description,
      cover_colour: source.cover_colour,
      icon: source.icon,
      is_template: !!is_template,
      is_archived: false,
    }).select().single()

    if (programError || !newProgram) {
      return NextResponse.json({ error: programError?.message ?? 'Failed to create program' }, { status: 500 })
    }

    const [{ data: sourceCategories }, { data: sourceAssets }] = await Promise.all([
      service.from('program_categories').select('*')
        .eq('program_id', id).order('sort_order').order('created_at'),
      service.from('program_assets').select('*')
        .eq('program_id', id).in('asset_type', ['note', 'link']),
    ])

    const tree = buildCategoryTree((sourceCategories ?? []) as ProgramCategory[])
    const idMap = new Map<string, string>()

    async function insertLevel(nodes: CategoryNode[], newParentId: string | null) {
      for (const node of nodes) {
        const { data: inserted } = await service.from('program_categories').insert({
          program_id: newProgram.id,
          parent_id: newParentId,
          name: node.name,
          description: node.description,
          colour: node.colour,
          icon: node.icon,
          sort_order: node.sort_order,
        }).select('id').single()

        if (inserted) {
          idMap.set(node.id, inserted.id)
          await insertLevel(node.children, inserted.id)
        }
      }
    }

    await insertLevel(tree, null)

    const assetsToCopy = (sourceAssets ?? []).map(a => ({
      program_id: newProgram.id,
      category_id: a.category_id ? idMap.get(a.category_id) ?? null : null,
      owner_id: user.id,
      name: a.name,
      description: a.description,
      asset_type: a.asset_type,
      note_content: a.note_content,
      external_url: a.external_url,
      sort_order: a.sort_order,
      ai_status: 'skipped',
    }))

    if (assetsToCopy.length > 0) {
      await service.from('program_assets').insert(assetsToCopy)
    }

    return NextResponse.json(newProgram)
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/types/programs.ts src/app/api/programs/route.ts "src/app/api/programs/[id]/duplicate/route.ts" && git commit -m "feat: programs phase 3 — duplicate endpoint and is_template filter"`

---

## C-3 — ProgramForm isTemplate support

*Codex edits:*
- [x] Edit `src/components/programs/ProgramForm.tsx`:
  - Add `isTemplate?: boolean` prop (default `false`) to the component's destructured props and
    type signature.
  - In `handleSubmit`, add `is_template: isTemplate` to the POST body sent to `/api/programs`.
  - Change the modal title `<h2>` text to `{isTemplate ? 'New template' : 'New program'}`.
  - Change the submit button text to `{saving ? 'Creating…' : isTemplate ? 'Create template' : 'Create program'}`.
  - Everything else in the file stays unchanged.

*Conductor:*
- [x] `pnpm run build` — must pass clean. `isTemplate` defaults to `false`, so existing call
  sites (which don't pass it) behave exactly as before.
- [x] Commit: `git add src/components/programs/ProgramForm.tsx && git commit -m "feat: programs phase 3 — ProgramForm isTemplate support"`

---

## C-4 — Programs dashboard: Templates tab, New template, Use template

*Codex edits:*
- [x] Replace `src/app/dashboard/programs/page.tsx` in full:
  ```typescript
  import { redirect } from 'next/navigation'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import ProgramsDashboardClient from '@/components/programs/ProgramsDashboardClient'
  import type { Program } from '@/types/programs'

  export default async function ProgramsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const service = createServiceClient()
    const { data: membership } = await service
      .from('organisation_members').select('org_id')
      .eq('user_id', user.id).maybeSingle()
    const orgId = membership?.org_id ?? null

    const baseQuery = (isTemplate: boolean) =>
      orgId
        ? service.from('programs').select('*')
            .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
            .eq('is_archived', false).eq('is_template', isTemplate)
            .order('created_at', { ascending: false })
        : service.from('programs').select('*')
            .eq('owner_id', user.id).eq('is_archived', false).eq('is_template', isTemplate)
            .order('created_at', { ascending: false })

    const [{ data: programs }, { data: templates }] = await Promise.all([
      baseQuery(false),
      baseQuery(true),
    ])

    return (
      <ProgramsDashboardClient
        programs={(programs ?? []) as Program[]}
        templates={(templates ?? []) as Program[]}
        orgId={orgId}
      />
    )
  }
  ```
- [x] Replace `src/components/programs/ProgramsDashboardClient.tsx` in full:
  ```typescript
  'use client'

  import { useState } from 'react'
  import Link from 'next/link'
  import { useRouter } from 'next/navigation'
  import { Library, Plus, BookOpen, Copy, X } from 'lucide-react'
  import ProgramForm from '@/components/programs/ProgramForm'
  import type { Program } from '@/types/programs'

  export default function ProgramsDashboardClient({
    programs,
    templates,
    orgId,
  }: {
    programs: Program[]
    templates: Program[]
    orgId: string | null
  }) {
    const router = useRouter()
    const [tab, setTab] = useState<'programs' | 'templates'>('programs')
    const [showForm, setShowForm] = useState(false)
    const [useTemplateTarget, setUseTemplateTarget] = useState<Program | null>(null)
    const [useTemplateName, setUseTemplateName] = useState('')
    const [creatingFromTemplate, setCreatingFromTemplate] = useState(false)

    const list = tab === 'programs' ? programs : templates

    function openUseTemplate(e: React.MouseEvent, template: Program) {
      e.preventDefault()
      e.stopPropagation()
      setUseTemplateTarget(template)
      setUseTemplateName(template.name)
    }

    async function submitUseTemplate() {
      if (!useTemplateTarget || !useTemplateName.trim()) return
      setCreatingFromTemplate(true)
      const res = await fetch(`/api/programs/${useTemplateTarget.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: useTemplateName.trim(), is_template: false }),
      })
      const json = await res.json()
      setCreatingFromTemplate(false)
      if (!res.ok) return
      setUseTemplateTarget(null)
      router.push(`/dashboard/programs/${json.id}`)
      router.refresh()
    }

    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Programs
              </h1>
              <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
                Reusable knowledge containers for your work
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-600"
            >
              <Plus size={16} />
              {tab === 'programs' ? 'New program' : 'New template'}
            </button>
          </div>

          <div className="mb-6 flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab('programs')}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${tab === 'programs' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
            >
              Programs
            </button>
            <button
              type="button"
              onClick={() => setTab('templates')}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${tab === 'templates' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
            >
              Templates
            </button>
          </div>

          {list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center dark:border-slate-700">
              <Library size={40} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                {tab === 'programs' ? 'No programs yet' : 'No templates yet'}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                {tab === 'programs'
                  ? 'Create your first program to start organising your content.'
                  : 'Save a program as a template, or create one from scratch.'}
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
              >
                {tab === 'programs' ? 'Create program' : 'Create template'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map(p => (
                <Link
                  key={p.id}
                  href={`/dashboard/programs/${p.id}`}
                  className="group relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
                >
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${p.cover_colour}1a`, color: p.cover_colour }}
                  >
                    <BookOpen size={20} />
                  </div>
                  <p className="font-bold text-gray-900 dark:text-slate-100">{p.name}</p>
                  {p.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2 dark:text-slate-400">{p.description}</p>
                  )}
                  <p className="mt-3 text-xs font-medium text-gray-400 dark:text-slate-500">
                    Created {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {tab === 'templates' && (
                    <button
                      type="button"
                      onClick={e => openUseTemplate(e, p)}
                      className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 opacity-0 hover:bg-gray-50 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <Copy size={11} />
                      Use template
                    </button>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <ProgramForm orgId={orgId} onClose={() => setShowForm(false)} isTemplate={tab === 'templates'} />
        )}

        {useTemplateTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Create program from template</h2>
                <button
                  type="button"
                  onClick={() => setUseTemplateTarget(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Program name</label>
              <input
                autoFocus
                type="text"
                value={useTemplateName}
                onChange={e => setUseTemplateName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setUseTemplateTarget(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitUseTemplate}
                  disabled={creatingFromTemplate || !useTemplateName.trim()}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                >
                  {creatingFromTemplate ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/dashboard/programs/page.tsx src/components/programs/ProgramsDashboardClient.tsx && git commit -m "feat: programs phase 3 — Templates tab, New template, Use template"`

---

## C-5 — ProgramExplorer: Save as template button

*Codex edits:*
- [x] Replace `src/components/programs/ProgramExplorer.tsx` in full:
  ```typescript
  'use client'

  import { useState, useCallback } from 'react'
  import Link from 'next/link'
  import { useRouter } from 'next/navigation'
  import { ArrowLeft, FolderOpen, Copy, X } from 'lucide-react'
  import CategoryTree from '@/components/programs/CategoryTree'
  import AssetGrid from '@/components/programs/AssetGrid'
  import { buildCategoryTree } from '@/lib/programs/build-tree'
  import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

  export default function ProgramExplorer({
    program,
    categories,
    assets,
    canManage,
  }: {
    program: Program
    categories: ProgramCategory[]
    assets: ProgramAsset[]
    canManage: boolean
  }) {
    const router = useRouter()
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
    const [localCategories, setLocalCategories] = useState<ProgramCategory[]>(categories)
    const [localAssets, setLocalAssets] = useState<ProgramAsset[]>(assets)
    const [showSaveTemplate, setShowSaveTemplate] = useState(false)
    const [templateName, setTemplateName] = useState(`${program.name} template`)
    const [savingTemplate, setSavingTemplate] = useState(false)

    const tree = buildCategoryTree(localCategories)

    const visibleAssets =
      selectedCategoryId === null
        ? localAssets
        : localAssets.filter(a => a.category_id === selectedCategoryId)

    const handleCategoryAdded = useCallback((cat: ProgramCategory) => {
      setLocalCategories(prev => [...prev, cat])
    }, [])

    const handleCategoryDeleted = useCallback((id: string) => {
      setLocalCategories(prev => prev.filter(c => c.id !== id))
      setLocalAssets(prev => prev.map(a => a.category_id === id ? { ...a, category_id: null } : a))
      setSelectedCategoryId(prev => prev === id ? null : prev)
    }, [])

    const handleAssetAdded = useCallback((asset: ProgramAsset) => {
      setLocalAssets(prev => [asset, ...prev])
    }, [])

    const handleAssetDeleted = useCallback((assetId: string) => {
      setLocalAssets(prev => prev.filter(a => a.id !== assetId))
    }, [])

    const handleAssetUpdated = useCallback((asset: ProgramAsset) => {
      setLocalAssets(prev => prev.map(a => a.id === asset.id ? asset : a))
    }, [])

    async function submitSaveTemplate() {
      if (!templateName.trim()) return
      setSavingTemplate(true)
      const res = await fetch(`/api/programs/${program.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), is_template: true }),
      })
      const json = await res.json()
      setSavingTemplate(false)
      if (!res.ok) return
      setShowSaveTemplate(false)
      router.push(`/dashboard/programs/${json.id}`)
      router.refresh()
    }

    return (
      <div className="flex h-[calc(100vh-64px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/programs"
              className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
            >
              <ArrowLeft size={14} />
              Programs
            </Link>
            <span className="text-gray-300 dark:text-slate-700">/</span>
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: program.cover_colour }}
              >
                <FolderOpen size={12} />
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{program.name}</span>
            </div>
          </div>
          {canManage && !program.is_template && (
            <button
              type="button"
              onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Copy size={12} />
              Save as template
            </button>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
            <CategoryTree
              programId={program.id}
              tree={tree}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
              canManage={canManage}
              onCategoryAdded={handleCategoryAdded}
              onCategoryDeleted={handleCategoryDeleted}
            />
          </aside>

          <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-slate-950">
            <AssetGrid
              programId={program.id}
              assets={visibleAssets}
              selectedCategoryId={selectedCategoryId}
              canManage={canManage}
              onAssetAdded={handleAssetAdded}
              onAssetDeleted={handleAssetDeleted}
              onAssetUpdated={handleAssetUpdated}
            />
          </main>
        </div>

        {showSaveTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Save as template</h2>
                <button
                  type="button"
                  onClick={() => setShowSaveTemplate(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Template name</label>
              <input
                autoFocus
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                Copies the category structure and note/link content only — uploaded files aren't included.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowSaveTemplate(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitSaveTemplate}
                  disabled={savingTemplate || !templateName.trim()}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                >
                  {savingTemplate ? 'Saving…' : 'Save template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/programs/ProgramExplorer.tsx && git commit -m "feat: programs phase 3 — Save as template button in explorer"`

---

## C-6 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner):
  1. Open `/dashboard/programs`. Confirm a "Programs" / "Templates" tab toggle appears.
  2. Switch to "Templates" — empty initially, button reads "New template".
  3. Open an existing program with a mix of categories, note/link assets, and at least one
     file-type asset.
  4. Click "Save as template" in the explorer header, confirm/edit the name, save.
  5. Confirm the new template's explorer shows matching categories and note/link assets, with
     file-type assets absent.
  6. Go to Templates tab — the new template is listed.
  7. Hover the template card, click "Use template", name it, create.
  8. Confirm a new, independent program is created with the same structure, appearing under
     "Programs" (not "Templates").
  9. Edit something in the new program and confirm the original template is unaffected.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: `programs.is_template` column exists, migration file committed
- [x] C-2: duplicate endpoint clones category tree + note/link assets; GET/POST extended
- [x] C-3: `ProgramForm` supports `isTemplate`, existing call sites unaffected
- [x] C-4: Templates tab, New template, Use template all work
- [x] C-5: Save as template button works from the explorer
- [ ] C-6: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-6 (no test runner in this project).
