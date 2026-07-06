# Subjects Folder Navigation + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Subjects page's 3 stacked dropdown selects with real per-level folder routes
(same underlying data, no schema change), plus an org-wide file search reachable from any level.

**Architecture:** Four nested Next.js routes under `/dashboard/subjects` (Year Group → Subject →
Topic → files), a shared layout providing a persistent search box, and one new search API route
querying `topic_assets` across every topic the caller can access. `TopicAssetsPanel` (the file
list itself) is reused completely unchanged.

**Tech Stack:** Next.js 16 App Router (Server Components + one new API route), TypeScript strict,
Supabase (`@supabase/ssr`), Tailwind v4, lucide-react (no new dependencies).

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean — no test
  runner in this project.
- No schema change — `subjects`, `topics`, `topic_assets`, and their existing RLS policies are
  completely untouched.
- No new npm dependencies.
- Source spec: `docs/superpowers/specs/2026-07-06-subjects-folder-navigation-and-search-design.md`

---

### Task 1: Folder routes + search

**Files:**
- Create: `src/components/topics/FolderTile.tsx`
- Create: `src/components/topics/SubjectsSearch.tsx`
- Create: `src/app/api/topics/search/route.ts`
- Create: `src/app/dashboard/subjects/layout.tsx`
- Modify: `src/app/dashboard/subjects/page.tsx` (rewrite — becomes Year Group folder list)
- Create: `src/app/dashboard/subjects/[yearGroup]/page.tsx`
- Create: `src/app/dashboard/subjects/[yearGroup]/[subjectId]/page.tsx`
- Create: `src/app/dashboard/subjects/[yearGroup]/[subjectId]/[topicId]/page.tsx`
- Delete: `src/components/topics/SubjectsBrowser.tsx` (superseded, no longer referenced anywhere)

**Interfaces:**
- Consumes: `TopicAssetsPanel` (existing, unchanged, `src/components/topics/TopicAssetsPanel.tsx`),
  `WorksheetAnnotatorModal` (existing, from the Collaborative Worksheet Annotation feature,
  `src/components/worksheets/WorksheetAnnotatorModal.tsx`), `YEAR_GROUPS`
  (`src/lib/tutoring/constants.ts`).
- Produces: `FolderTile({ href, label })` — a plain link-styled folder tile, no other task
  depends on it. `/api/topics/search?q=<query>` returns
  `{ id, name, asset_type, topic_id, year_group, subject_id, subject_name, topic_name }[]`.

All files in one task — the layout imports `SubjectsSearch` and the new page routes replace the
old dropdown page in one coherent change; splitting would leave an intermediate state where
`layout.tsx` imports a component that doesn't exist yet, or the old and new Subjects pages
coexist inconsistently.

- [ ] **Step 1: Create `src/components/topics/FolderTile.tsx`**

```typescript
import Link from 'next/link'
import { Folder } from 'lucide-react'

export default function FolderTile({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-800 dark:hover:bg-slate-800"
    >
      <Folder size={20} className="shrink-0 text-cyan-500" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}
```

- [ ] **Step 2: Create the search API route** `src/app/api/topics/search/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const service = createServiceClient()
  const subjectsQuery = orgId
    ? service.from('subjects').select('id, name').eq('org_id', orgId)
    : service.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id)
  const { data: subjectRows } = await subjectsQuery
  const subjectIds = (subjectRows ?? []).map(s => s.id)
  if (subjectIds.length === 0) return NextResponse.json([])
  const subjectNameMap = new Map((subjectRows ?? []).map(s => [s.id, s.name]))

  const { data: topics } = await service
    .from('topics').select('id, name, year_group, subject_id').in('subject_id', subjectIds)
  const topicMap = new Map((topics ?? []).map(t => [t.id, t]))
  const topicIds = [...topicMap.keys()]
  if (topicIds.length === 0) return NextResponse.json([])

  const { data: assets } = await service
    .from('topic_assets')
    .select('id, name, asset_type, topic_id')
    .in('topic_id', topicIds)
    .ilike('name', `%${q}%`)
    .limit(30)

  const results = (assets ?? []).map(a => {
    const topic = topicMap.get(a.topic_id)
    return {
      id: a.id,
      name: a.name,
      asset_type: a.asset_type,
      topic_id: a.topic_id,
      year_group: topic?.year_group ?? '',
      subject_id: topic?.subject_id ?? '',
      subject_name: topic ? (subjectNameMap.get(topic.subject_id) ?? '') : '',
      topic_name: topic?.name ?? '',
    }
  })

  return NextResponse.json(results)
}
```

(this mirrors the org/solo branching pattern the existing `/dashboard/subjects/page.tsx` already
uses — search scans every topic the caller can access, not a single one, which is the only
difference from `getTopicAccess()`'s single-topic check)

- [ ] **Step 3: Create `src/components/topics/SubjectsSearch.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, PenSquare } from 'lucide-react'
import WorksheetAnnotatorModal from '@/components/worksheets/WorksheetAnnotatorModal'
import { createClient } from '@/lib/supabase-browser'

type SearchResult = {
  id: string
  name: string
  asset_type: string
  topic_id: string
  year_group: string
  subject_id: string
  subject_name: string
  topic_name: string
}

export default function SubjectsSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [annotating, setAnnotating] = useState<SearchResult | null>(null)
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/topics/search?q=${encodeURIComponent(query.trim())}`)
        .then(res => (res.ok ? (res.json() as Promise<SearchResult[]>) : []))
        .then(data => { setResults(data); setLoading(false) })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function handleView(r: SearchResult) {
    const res = await fetch(`/api/topics/${r.topic_id}/assets/${r.id}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(r: SearchResult) {
    await fetch(`/api/topics/${r.topic_id}/assets/${r.id}`, { method: 'DELETE' })
    setResults(prev => prev.filter(x => x.id !== r.id))
  }

  async function handleAnnotate(r: SearchResult) {
    const res = await fetch(`/api/topics/${r.topic_id}/assets/${r.id}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) { setAnnotateUrl(data.url); setAnnotating(r) }
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search all worksheets by name…"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />

      {query.trim() && (
        <div className="rounded-xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="p-3 text-xs text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-gray-400">No files match &quot;{query}&quot;.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {results.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="shrink-0 text-cyan-600" />
                      <span className="truncate font-medium text-gray-900 dark:text-slate-100">{r.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-400">{r.year_group} · {r.subject_name} · {r.topic_name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button type="button" onClick={() => handleView(r)} className="text-xs font-bold text-cyan-600 hover:underline">View</button>
                    {(r.asset_type === 'pdf' || r.asset_type === 'image') && (
                      <button type="button" onClick={() => handleAnnotate(r)} className="text-gray-400 hover:text-cyan-600" title="Annotate">
                        <PenSquare size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => handleDelete(r)} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {annotating && annotateUrl && currentUserId && (
        <WorksheetAnnotatorModal
          topicAssetId={annotating.id}
          assetType={annotating.asset_type as 'pdf' | 'image'}
          fileUrl={annotateUrl}
          currentUserId={currentUserId}
          onClose={() => { setAnnotating(null); setAnnotateUrl(null) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/dashboard/subjects/layout.tsx`**

```typescript
import SubjectsSearch from '@/components/topics/SubjectsSearch'

export default function SubjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Subjects</h1>
        <SubjectsSearch />
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite `src/app/dashboard/subjects/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { YEAR_GROUPS } from '@/lib/tutoring/constants'
import FolderTile from '@/components/topics/FolderTile'

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {YEAR_GROUPS.map(yg => (
        <FolderTile key={yg} href={`/dashboard/subjects/${encodeURIComponent(yg)}`} label={yg} />
      ))}
    </div>
  )
}
```

(the outer page wrapper/heading/search now live in `layout.tsx` from Step 4 — this page renders
only its own content, matching how Next.js layouts and pages compose)

- [ ] **Step 6: Create `src/app/dashboard/subjects/[yearGroup]/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FolderTile from '@/components/topics/FolderTile'

export default async function YearGroupSubjectsPage({ params }: { params: Promise<{ yearGroup: string }> }) {
  const { yearGroup: yearGroupParam } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const subjectsQuery = orgId
    ? supabase.from('subjects').select('id, name').eq('org_id', orgId).eq('archived', false).order('name')
    : supabase.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
  const { data: subjects } = await subjectsQuery

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{yearGroup}</span>
      </nav>

      {(subjects ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500">No subjects yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(subjects ?? []).map(s => (
            <FolderTile key={s.id} href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${s.id}`} label={s.name} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Create `src/app/dashboard/subjects/[yearGroup]/[subjectId]/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FolderTile from '@/components/topics/FolderTile'

export default async function SubjectTopicsPage({
  params,
}: {
  params: Promise<{ yearGroup: string; subjectId: string }>
}) {
  const { yearGroup: yearGroupParam, subjectId } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subject } = await supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle()
  if (!subject) notFound()

  const { data: topics } = await supabase
    .from('topics')
    .select('id, name')
    .eq('subject_id', subjectId)
    .eq('year_group', yearGroup)
    .eq('archived', false)
    .order('name')

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}`} className="hover:text-cyan-600">{yearGroup}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{subject.name}</span>
      </nav>

      {(topics ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500">
          No topics for {yearGroup} · {subject.name} yet — create one while booking a session.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(topics ?? []).map(t => (
            <FolderTile
              key={t.id}
              href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${subjectId}/${t.id}`}
              label={t.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

(RLS on `subjects` already restricts SELECT to org members / the solo creator — an unauthorized
`subjectId` naturally returns no row here, triggering `notFound()`, with no separate app-level
access check needed)

- [ ] **Step 8: Create `src/app/dashboard/subjects/[yearGroup]/[subjectId]/[topicId]/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import TopicAssetsPanel from '@/components/topics/TopicAssetsPanel'

export default async function TopicFilesPage({
  params,
}: {
  params: Promise<{ yearGroup: string; subjectId: string; topicId: string }>
}) {
  const { yearGroup: yearGroupParam, subjectId, topicId } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subject } = await supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle()
  if (!subject) notFound()

  const { data: topic } = await supabase.from('topics').select('id, name').eq('id', topicId).maybeSingle()
  if (!topic) notFound()

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}`} className="hover:text-cyan-600">{yearGroup}</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${subjectId}`} className="hover:text-cyan-600">{subject.name}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{topic.name}</span>
      </nav>

      <TopicAssetsPanel topicId={topicId} />
    </div>
  )
}
```

- [ ] **Step 9: Delete the now-unused dropdown component**

Delete `src/components/topics/SubjectsBrowser.tsx` (nothing imports it once Step 5 replaces its
only usage).

- [ ] **Step 10: Build**

Run: `pnpm run build`
Expected: passes clean (tsc + eslint). Confirms no other file still imports the deleted
`SubjectsBrowser.tsx`.

- [ ] **Step 11: Manual smoke test**

On `/dashboard/subjects`: click through Year Group → Subject → Topic folder tiles, confirm each
breadcrumb link works and the browser's native back button steps back through the levels
correctly. Confirm the file list at the deepest level is identical to before (same
upload/view/annotate/delete actions). Type a partial file name into the search box (visible at
every level) and confirm matching results appear with the correct breadcrumb, and that View,
Annotate (for pdf/image), and Delete all work directly from a search result. Clear the search box
and confirm the folder view returns. If a second test account is available, confirm search results
never show another org's/solo-pro's files.

- [ ] **Step 12: Commit**

```bash
git add src/components/topics/FolderTile.tsx src/components/topics/SubjectsSearch.tsx src/app/api/topics/search/route.ts src/app/dashboard/subjects/layout.tsx src/app/dashboard/subjects/page.tsx "src/app/dashboard/subjects/[yearGroup]" src/components/topics/SubjectsBrowser.tsx
git commit -m "feat: subjects page — folder navigation and org-wide search"
```

(the `git add` of a deleted file stages its removal; the quoted `[yearGroup]` path covers the
whole new nested route tree)

---

## Acceptance checklist

- [ ] Four folder levels navigable via real routes with working breadcrumbs and browser back
  button.
- [ ] Search finds files by partial name across every topic the caller can access, with working
  View/Annotate/Delete actions directly from results.
- [ ] `TopicAssetsPanel` (file list, upload, link/note) works identically to before — unchanged.
- [ ] `SubjectsBrowser.tsx` removed, no dangling import.
- [ ] `pnpm run build` passes clean.

## Verification

`pnpm run build` must pass clean — no test runner in this project. Manual browser smoke (folder
navigation + search, ideally with a second account to confirm scoping) is required per this
project's established convention that real bugs have repeatedly only surfaced through manual
testing, not the build alone.
