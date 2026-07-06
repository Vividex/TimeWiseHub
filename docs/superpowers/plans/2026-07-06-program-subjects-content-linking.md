# Program–Subjects Content Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Program reference (not copy) an existing Subjects worksheet, and let that
referenced worksheet be annotated from either system — bridges the two parallel content systems
the user found confusing to relate to each other.

**Architecture:** One new nullable FK column on `program_assets` pointing at `topic_assets`, one
shared signed-URL resolver used by both existing places that already sign program asset URLs, a
new search-and-link tab in the existing "Add content" modal, and an Annotate action added to both
places a program asset is already rendered (standalone page, in-call panel) — reusing the
`WorksheetAnnotator`/`WorksheetAnnotatorModal` components built for the Collaborative Worksheet
Annotation feature entirely unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind v4,
lucide-react (no new dependencies).

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean — no test
  runner in this project.
- No new npm dependencies.
- Migrations are committed as `supabase/schema-NNN-<name>.sql` and applied via Supabase MCP
  `apply_migration`.
- Source spec: `docs/superpowers/specs/2026-07-06-program-subjects-content-linking-design.md`

---

### Task 1: Database migration

*Conductor only (no Codex dispatch) — DB migration via Supabase MCP.*

**Files:**
- Create: `supabase/schema-093-program-topic-asset-link.sql`

**Interfaces:**
- Produces: `program_assets.linked_topic_asset_id uuid references topic_assets(id) on delete
  cascade`. Every later task's queries/types depend on this exact column name.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 093: Program can reference a Subjects worksheet
-- Additive nullable column — no data migration needed. Run via
-- Supabase MCP apply_migration (name: program_topic_asset_link)
-- ============================================================

alter table public.program_assets
  add column linked_topic_asset_id uuid references public.topic_assets(id) on delete cascade;

create index program_assets_linked_topic_asset
  on public.program_assets (linked_topic_asset_id) where linked_topic_asset_id is not null;
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `apply_migration` with `name: program_topic_asset_link` and the SQL above.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'program_assets' and column_name = 'linked_topic_asset_id';
```
Expected: 1 row, nullable.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-093-program-topic-asset-link.sql
git commit -m "feat: program-subjects linking — database migration"
```

---

### Task 2: Shared signed-URL resolver, wired into both existing call sites

**Files:**
- Modify: `src/types/programs.ts` (add `linked_topic_asset_id` to `ProgramAsset`)
- Modify: `src/lib/program-storage.ts` (add `resolveProgramAssetSignedUrl`)
- Modify: `src/app/dashboard/programs/[id]/page.tsx`
- Modify: `src/app/dashboard/video/[roomId]/page.tsx` (`fetchLinkedProgram`)

**Interfaces:**
- Produces: `resolveProgramAssetSignedUrl(asset: ProgramAsset): Promise<string | null>` — both
  page files call this instead of their own inline `storage_path`-signing logic. No other task
  depends on this function directly, but Task 4/5 depend on `asset.linked_topic_asset_id` being
  present on every `ProgramAsset` from this task onward.

All 4 files in one task — the resolver is introduced and immediately consumes both existing call
sites in the same change; leaving one call site still doing its own inline signing would be an
inconsistent, half-migrated state.

- [ ] **Step 1: Add the field to `ProgramAsset`**

In `src/types/programs.ts`, change:
```typescript
export type ProgramAsset = {
  id: string
  program_id: string
  category_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  asset_type: ProgramAssetType
  storage_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  external_url: string | null
  note_content: string | null
  ai_status: AiProcessingStatus
  ai_summary: string | null
  ai_tags: string[]
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  signed_url?: string | null
}
```
to:
```typescript
export type ProgramAsset = {
  id: string
  program_id: string
  category_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  asset_type: ProgramAssetType
  storage_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  external_url: string | null
  note_content: string | null
  linked_topic_asset_id: string | null
  ai_status: AiProcessingStatus
  ai_summary: string | null
  ai_tags: string[]
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  signed_url?: string | null
}
```

- [ ] **Step 2: Add the resolver to `src/lib/program-storage.ts`**

Add this import and function (keep the existing exports unchanged):
```typescript
import { createServiceClient } from '@/lib/supabase-service'
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import type { ProgramAsset } from '@/types/programs'

export async function resolveProgramAssetSignedUrl(asset: ProgramAsset): Promise<string | null> {
  if (asset.linked_topic_asset_id) {
    const service = createServiceClient()
    const { data: topicAsset } = await service
      .from('topic_assets').select('storage_path').eq('id', asset.linked_topic_asset_id).maybeSingle()
    if (!topicAsset?.storage_path) return null
    return createTopicAssetSignedUrl(topicAsset.storage_path)
  }
  if (asset.storage_path) {
    return createProgramAssetSignedUrl(asset.storage_path)
  }
  return null
}
```

(the existing `createProgramAssetSignedUrl`/`deleteProgramAssetFile`/`programStoragePath` exports
in this file are untouched — this only adds the new function and the two new imports it needs)

- [ ] **Step 3: Use it in `src/app/dashboard/programs/[id]/page.tsx`**

Change the import from:
```typescript
import { createProgramAssetSignedUrl } from '@/lib/program-storage'
```
to:
```typescript
import { resolveProgramAssetSignedUrl } from '@/lib/program-storage'
```

Change:
```typescript
  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => {
      if (asset.storage_path) {
        const signed_url = await createProgramAssetSignedUrl(asset.storage_path)
        return { ...asset, signed_url }
      }
      return { ...asset, signed_url: null }
    }),
  )
```
to:
```typescript
  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => ({ ...asset, signed_url: await resolveProgramAssetSignedUrl(asset) })),
  )
```

- [ ] **Step 4: Use it in `src/app/dashboard/video/[roomId]/page.tsx`**

Change the import from:
```typescript
import { createProgramAssetSignedUrl } from '@/lib/program-storage'
```
to:
```typescript
import { resolveProgramAssetSignedUrl } from '@/lib/program-storage'
```

Change (inside `fetchLinkedProgram`):
```typescript
  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => {
      if (asset.storage_path) {
        const signed_url = await createProgramAssetSignedUrl(asset.storage_path)
        return { ...asset, signed_url }
      }
      return { ...asset, signed_url: null }
    }),
  )
```
to:
```typescript
  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => ({ ...asset, signed_url: await resolveProgramAssetSignedUrl(asset) })),
  )
```

- [ ] **Step 5: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/types/programs.ts src/lib/program-storage.ts "src/app/dashboard/programs/[id]/page.tsx" "src/app/dashboard/video/[roomId]/page.tsx"
git commit -m "feat: program-subjects linking — shared signed-URL resolver"
```

---

### Task 3: Add-content flow — "From Subjects" tab

**Files:**
- Modify: `src/app/api/programs/[id]/assets/route.ts`
- Modify: `src/components/programs/AssetUploadZone.tsx`

**Interfaces:**
- Consumes: `getTopicAccess` (existing, `src/lib/tutoring/topic-access.ts`) — used to verify the
  caller actually has access to the topic asset they're trying to link, not just to the
  destination program (a program's own `assertAdminAccess` check says nothing about whether the
  caller can see the *source* topic asset).
- Produces: no new exports consumed elsewhere.

- [ ] **Step 1: Add the new branch to the API route**

In `src/app/api/programs/[id]/assets/route.ts`, add this import:
```typescript
import { getTopicAccess } from '@/lib/tutoring/topic-access'
```

Inside the existing `if (contentType.includes('application/json')) { ... }` block, change:
```typescript
    const { asset_type, name, note_content, external_url, category_id } = body
```
to:
```typescript
    const { asset_type, name, note_content, external_url, category_id, link_topic_asset_id } = body

    if (link_topic_asset_id) {
      const service = createServiceClient()
      const { data: topicAsset } = await service
        .from('topic_assets').select('id, name, asset_type, topic_id').eq('id', link_topic_asset_id).maybeSingle()
      if (!topicAsset) return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 })

      const access = await getTopicAccess(topicAsset.topic_id, user.id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: topicAsset.asset_type,
        name: topicAsset.name,
        linked_topic_asset_id: topicAsset.id,
        ai_status: 'skipped',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }
```

(this new branch goes before the existing `if (asset_type === 'note')` check, since
`link_topic_asset_id` requests don't send an `asset_type` at all in the request body — it's
derived from the topic asset itself)

- [ ] **Step 2: Add the "From Subjects" tab to `AssetUploadZone.tsx`**

Read the file first (re-read to confirm current content before editing — it was shown in full
during planning above this task).

Change the `Tab` type and imports from:
```typescript
import { useState, useRef, useCallback } from 'react'
import { Upload, BookOpen, Link, X } from 'lucide-react'
import type { ProgramAsset } from '@/types/programs'

type Tab = 'file' | 'note' | 'link'
```
to:
```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, BookOpen, Link, X, Search, FileText } from 'lucide-react'
import type { ProgramAsset } from '@/types/programs'

type Tab = 'file' | 'note' | 'link' | 'subjects'

type SubjectsSearchResult = {
  id: string
  name: string
  asset_type: string
  topic_id: string
  year_group: string
  subject_id: string
  subject_name: string
  topic_name: string
}
```

Change the tab bar from:
```typescript
          {([['file', Upload, 'File'], ['note', BookOpen, 'Note'], ['link', Link, 'Link / Video']] as const).map(([key, Icon, label]) => (
```
to:
```typescript
          {([['file', Upload, 'File'], ['note', BookOpen, 'Note'], ['link', Link, 'Link / Video'], ['subjects', Search, 'From Subjects']] as const).map(([key, Icon, label]) => (
```

Add state near the other `useState` calls (right after `const [linkType, setLinkType] = useState<'link' | 'video'>('link')`):
```typescript
  const [subjectsQuery, setSubjectsQuery] = useState('')
  const [subjectsResults, setSubjectsResults] = useState<SubjectsSearchResult[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
```

Add this effect near the other logic (debounced search, same pattern as `SubjectsSearch.tsx`):
```typescript
  useEffect(() => {
    if (!subjectsQuery.trim()) { setSubjectsResults([]); return }
    setSubjectsLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/topics/search?q=${encodeURIComponent(subjectsQuery.trim())}`)
        .then(res => (res.ok ? (res.json() as Promise<SubjectsSearchResult[]>) : []))
        .then(data => { setSubjectsResults(data); setSubjectsLoading(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [subjectsQuery])

  async function handleLinkSubjectsAsset(result: SubjectsSearchResult) {
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_topic_asset_id: result.id, category_id: categoryId }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed to link'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }
```

Add the new tab body — insert this right after the closing `)}` of the existing `{tab === 'link' && ( ... )}` block, before the `{error && ...}` line:
```typescript
          {tab === 'subjects' && (
            <div className="space-y-3">
              <input
                autoFocus
                value={subjectsQuery}
                onChange={e => setSubjectsQuery(e.target.value)}
                placeholder="Search worksheets by name…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {subjectsQuery.trim() && (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-800">
                  {subjectsLoading ? (
                    <p className="p-3 text-xs text-gray-400">Searching…</p>
                  ) : subjectsResults.length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No worksheets match &quot;{subjectsQuery}&quot;.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                      {subjectsResults.map(r => (
                        <li key={r.id}>
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => handleLinkSubjectsAsset(r)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <FileText size={14} className="shrink-0 text-cyan-600" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-slate-100">{r.name}</span>
                              <span className="block truncate text-xs text-gray-400">{r.year_group} · {r.subject_name} · {r.topic_name}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Manual smoke test**

From a Program's page, click "Add content" → "From Subjects", search for an existing worksheet by
partial name, click it, confirm it appears in the Program's asset grid with the correct name/type.
Confirm opening it shows the same file as opening it from Subjects directly.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/programs/[id]/assets/route.ts" src/components/programs/AssetUploadZone.tsx
git commit -m "feat: program-subjects linking — search and link from Add content"
```

---

### Task 4: Annotate from the standalone Program page

**Files:**
- Modify: `src/components/programs/AssetCard.tsx`

**Interfaces:**
- Consumes: `WorksheetAnnotatorModal` (existing, `src/components/worksheets/WorksheetAnnotatorModal.tsx`).
- Produces: no new exports consumed elsewhere.

- [ ] **Step 1: Add the Annotate button and modal**

Change the imports from:
```typescript
import { useState } from 'react'
import {
  FileText, Image, Music, Link, BookOpen, FileSpreadsheet, File,
  MoreVertical, Trash2, ExternalLink, Sparkles, X,
} from 'lucide-react'
import type { ProgramAsset, ProgramAssetType } from '@/types/programs'
```
to:
```typescript
import { useEffect, useState } from 'react'
import {
  FileText, Image, Music, Link, BookOpen, FileSpreadsheet, File,
  MoreVertical, Trash2, ExternalLink, Sparkles, X, PenSquare,
} from 'lucide-react'
import type { ProgramAsset, ProgramAssetType } from '@/types/programs'
import WorksheetAnnotatorModal from '@/components/worksheets/WorksheetAnnotatorModal'
import { createClient } from '@/lib/supabase-browser'
```

Add state inside the component, alongside the existing `useState` calls:
```typescript
  const [annotating, setAnnotating] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
  }, [])

  const canAnnotate = !!asset.linked_topic_asset_id && (asset.asset_type === 'pdf' || asset.asset_type === 'image') && !!asset.signed_url
```

Change the action row from:
```typescript
      <div className="mt-3 flex items-center gap-2">
        {(asset.signed_url || asset.external_url) && (
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ExternalLink size={11} />
            Open
          </button>
        )}
        {asset.asset_type === 'note' && asset.note_content && (
          <span className="flex-1 text-xs text-gray-400 line-clamp-1 dark:text-slate-500">
            {asset.note_content.slice(0, 60)}
          </span>
        )}
      </div>
```
to:
```typescript
      <div className="mt-3 flex items-center gap-2">
        {(asset.signed_url || asset.external_url) && (
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ExternalLink size={11} />
            Open
          </button>
        )}
        {canAnnotate && (
          <button
            type="button"
            onClick={() => setAnnotating(true)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <PenSquare size={11} />
            Annotate
          </button>
        )}
        {asset.asset_type === 'note' && asset.note_content && (
          <span className="flex-1 text-xs text-gray-400 line-clamp-1 dark:text-slate-500">
            {asset.note_content.slice(0, 60)}
          </span>
        )}
      </div>

      {annotating && canAnnotate && currentUserId && (
        <WorksheetAnnotatorModal
          topicAssetId={asset.linked_topic_asset_id!}
          assetType={asset.asset_type as 'pdf' | 'image'}
          fileUrl={asset.signed_url!}
          currentUserId={currentUserId}
          onClose={() => setAnnotating(false)}
        />
      )}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 3: Manual smoke test**

On a Program with a linked Subjects worksheet (from Task 3), confirm the "Annotate" button appears
only for that asset (not for native uploads or non-pdf/image types), and that opening it shows the
same worksheet/annotations as annotating it from Subjects for the same student.

- [ ] **Step 4: Commit**

```bash
git add src/components/programs/AssetCard.tsx
git commit -m "feat: program-subjects linking — annotate from the standalone Program page"
```

---

### Task 5: Annotate from the in-call Program panel

**Files:**
- Modify: `src/components/video/ProgramReferencePanel.tsx`
- Modify: `src/components/video/CallRoom.tsx`

**Interfaces:**
- Consumes: `WorksheetAnnotator` (existing, `src/components/worksheets/WorksheetAnnotator.tsx`) —
  rendered directly, not the modal wrapper, since the student is already known from the call
  context (no picker needed, matching how `WorksheetTab` from the Collaborative Worksheet
  Annotation plan already does this).
- Produces: no new exports consumed elsewhere — final task in this plan.

- [ ] **Step 1: Modify `ProgramReferencePanel.tsx`**

Read the file first (re-read to confirm current content before editing — it was shown in full
during planning above this task).

Change the imports from:
```typescript
import { useState } from 'react'
import { FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, Send } from 'lucide-react'
import type { LinkedProgramBundle, ProgramAsset, ProgramAssetType } from '@/types/programs'
```
to:
```typescript
import { useState } from 'react'
import { FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, Send, PenSquare } from 'lucide-react'
import type { LinkedProgramBundle, ProgramAsset, ProgramAssetType } from '@/types/programs'
import WorksheetAnnotator from '@/components/worksheets/WorksheetAnnotator'
```

Change the component signature from:
```typescript
export default function ProgramReferencePanel({
  linkedProgram,
  sessionChat,
}: {
  linkedProgram: LinkedProgramBundle
  sessionChat: { conversationId: string } | null
}) {
```
to:
```typescript
export default function ProgramReferencePanel({
  linkedProgram,
  sessionChat,
  sessionStudentId,
  currentUserId,
}: {
  linkedProgram: LinkedProgramBundle
  sessionChat: { conversationId: string } | null
  sessionStudentId: string | null
  currentUserId: string
}) {
```

Add state near the existing `useState` calls:
```typescript
  const [annotatingAsset, setAnnotatingAsset] = useState<ProgramAsset | null>(null)
```

Add an early return for the annotator view — right after the destructuring of `categories, assets`
and before the existing `visibleAssets` computation, add:
```typescript
  if (annotatingAsset && sessionStudentId) {
    return (
      <div className="flex h-full flex-col">
        <button
          type="button"
          onClick={() => setAnnotatingAsset(null)}
          className="border-b border-slate-700 px-3 py-2 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
        >
          ← Back to program files
        </button>
        <div className="flex-1 overflow-hidden">
          <WorksheetAnnotator
            topicAssetId={annotatingAsset.linked_topic_asset_id!}
            studentId={sessionStudentId}
            fileUrl={annotatingAsset.signed_url!}
            assetType={annotatingAsset.asset_type as 'pdf' | 'image'}
            currentUserId={currentUserId}
          />
        </div>
      </div>
    )
  }
```

Change the asset row's action button block from:
```typescript
                  {sessionChat && (
                    <button
                      onClick={() => shareToChat(asset)}
                      disabled={sharingId === asset.id}
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-cyan-400 disabled:opacity-50"
                      title="Share to chat"
                    >
                      <Send size={12} />
                    </button>
                  )}
```
to:
```typescript
                  {sessionChat && (
                    <button
                      onClick={() => shareToChat(asset)}
                      disabled={sharingId === asset.id}
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-cyan-400 disabled:opacity-50"
                      title="Share to chat"
                    >
                      <Send size={12} />
                    </button>
                  )}
                  {asset.linked_topic_asset_id && (asset.asset_type === 'pdf' || asset.asset_type === 'image') && asset.signed_url && sessionStudentId && (
                    <button
                      onClick={() => setAnnotatingAsset(asset)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-cyan-400"
                      title="Annotate"
                    >
                      <PenSquare size={12} />
                    </button>
                  )}
```

- [ ] **Step 2: Wire the new props in `CallRoom.tsx`**

Change:
```typescript
        {activeTab === 'program' && linkedProgram && (
          <ProgramReferencePanel linkedProgram={linkedProgram} sessionChat={sessionChat ?? null} />
        )}
```
to:
```typescript
        {activeTab === 'program' && linkedProgram && (
          <ProgramReferencePanel
            linkedProgram={linkedProgram}
            sessionChat={sessionChat ?? null}
            sessionStudentId={sessionStudentId ?? null}
            currentUserId={currentUserId ?? ''}
          />
        )}
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Manual smoke test**

In a live call whose session has both a linked topic asset (Program) and a linked Subjects
worksheet (via Task 3) and a `student_id`, open the Program tab, click Annotate on the linked
worksheet, confirm it opens directly (no student picker) to that session's student, and that
annotations made here are visible when reopening the same worksheet from Subjects for the same
student afterward.

- [ ] **Step 5: Commit**

```bash
git add src/components/video/ProgramReferencePanel.tsx src/components/video/CallRoom.tsx
git commit -m "feat: program-subjects linking — annotate from the in-call Program panel"
```

---

## Acceptance checklist

- [ ] Task 1: `program_assets.linked_topic_asset_id` column applied and verified.
- [ ] Task 2: shared resolver in place, both existing signed-URL call sites use it, build passes.
- [ ] Task 3: "From Subjects" tab searches and links an existing worksheet into a Program without
  duplicating storage.
- [ ] Task 4: Annotate works from the standalone Program page for a linked pdf/image asset.
- [ ] Task 5: Annotate works from the in-call Program panel, no picker needed, same data as
  Subjects' own annotation entry points.

## Verification

`pnpm run build` must pass clean after every task — no test runner in this project. Manual browser
smoke is required for Tasks 3 through 5, per this project's established convention that real bugs
have repeatedly only surfaced through manual testing, not the build alone.
