# Programs Phase 2 — AI Summarisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate a short summary and tags for `note`, `image`, and `pdf` program assets using Claude, surfaced as tag pills on the card and a "View AI summary" popover.

**Architecture:** A shared `summariseAsset()` helper builds the right Claude request per asset type (plain text for notes, an `image` content block for images, a `document` content block for PDFs — all via the Claude SDK/model already used elsewhere in this codebase) and parses a fixed Summary/Tags text template out of the response. A new API route calls it and writes the result back to `program_assets`. The upload UI fires a non-awaited request to that route right after an eligible asset is created.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase (service client + Storage), `@anthropic-ai/sdk` (already installed, `^0.100.1`), Lucide React icons. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages.
- All Tailwind classes must include `dark:` variants.
- Reuse the existing Claude client pattern exactly: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`, model `'claude-haiku-4-5-20251001'`, `max_tokens: 1024` — matching `src/app/api/video/notes/[callId]/summarise/route.ts` and `src/app/api/assistant/route.ts`.
- Only `note`/`image`/`pdf` asset types get summarised. Every other type keeps `ai_status: 'skipped'` exactly as today — no behavior change for them.
- No new DB migration — `ai_status`/`ai_summary`/`ai_tags` columns already exist on `program_assets` (Phase 1).
- Failure handling: any error sets `ai_status: 'failed'` and stops. No retries.

---

## File Map

**New files:**
```
src/lib/programs/summarise-asset.ts
src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts
```

**Modified files:**
```
src/app/api/programs/[id]/assets/route.ts   — ai_status defaults to 'pending' for note/image/pdf
src/components/programs/AssetUploadZone.tsx — fire-and-forget summarise trigger after upload
src/components/programs/AssetCard.tsx       — tag pills + View AI summary popover
```

---

## Task 1: Shared Claude summarisation module

**Files:**
- Create: `src/lib/programs/summarise-asset.ts`

**Interfaces:**
- Produces: `summariseAsset(asset: ProgramAsset): Promise<{ summary: string; tags: string[] } | null>`
- Consumed by: Task 2 (the summarise API route)

- [ ] **Step 1: Write the module**

Create `src/lib/programs/summarise-asset.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-service'
import type { ProgramAsset } from '@/types/programs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORMAT_INSTRUCTIONS = `Respond in exactly this format — no preamble, no extra sections:

## Summary
<2-3 sentence summary>

## Tags
tag1, tag2, tag3`

function parseSummaryResponse(text: string): { summary: string; tags: string[] } {
  const summaryMatch = text.match(/## Summary\s*([\s\S]*?)(?=## Tags|$)/i)
  const tagsMatch = text.match(/## Tags\s*([\s\S]*)$/i)
  const summary = summaryMatch ? summaryMatch[1].trim() : text.trim()
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : []
  return { summary, tags }
}

export async function summariseAsset(
  asset: ProgramAsset,
): Promise<{ summary: string; tags: string[] } | null> {
  if (asset.asset_type === 'note') {
    const content = asset.note_content?.trim() ?? ''
    if (content.length < 20) return null

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Summarise this note and suggest a few tags for it.\n\n${FORMAT_INSTRUCTIONS}\n\nNote:\n${content}`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!text) return null
    return parseSummaryResponse(text)
  }

  if (asset.asset_type === 'image' || asset.asset_type === 'pdf') {
    if (!asset.storage_path || !asset.mime_type) return null

    const service = createServiceClient()
    const { data: file, error } = await service.storage
      .from('program-assets')
      .download(asset.storage_path)
    if (error || !file) return null

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
      asset.asset_type === 'image'
        ? {
            type: 'image',
            source: {
              type: 'base64',
              media_type: asset.mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          }
        : {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          { type: 'text', text: `Summarise this file and suggest a few tags for it.\n\n${FORMAT_INSTRUCTIONS}` },
        ],
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!text) return null
    return parseSummaryResponse(text)
  }

  return null
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. Nothing imports this module yet, so this
  only checks it compiles standalone (including the `Anthropic.ImageBlockParam`/`DocumentBlockParam`
  types resolving correctly against the installed SDK version).

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/programs/summarise-asset.ts
  git commit -m "feat: programs phase 2 — shared Claude asset summarisation module"
  ```

---

## Task 2: Summarise API route

**Files:**
- Create: `src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts`

**Interfaces:**
- Consumes: `summariseAsset` (Task 1)
- Produces: `POST /api/programs/[id]/assets/[assetId]/summarise` → `{ ok: true }` (or `{ ok: true, skipped: true }`)

- [ ] **Step 1: Write the route**

Create `src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { summariseAsset } from '@/lib/programs/summarise-asset'
import type { ProgramAsset } from '@/types/programs'

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return false
  if (program.owner_id === userId) return true
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  return !!m && ['owner', 'admin', 'manager'].includes(m.role as string)
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: asset } = await service
    .from('program_assets').select('*').eq('id', assetId).eq('program_id', id).maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const typed = asset as ProgramAsset
  if (!['note', 'image', 'pdf'].includes(typed.asset_type)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  await service.from('program_assets').update({ ai_status: 'processing' }).eq('id', assetId)

  try {
    const result = await summariseAsset(typed)
    if (!result) {
      await service.from('program_assets').update({ ai_status: 'skipped' }).eq('id', assetId)
      return NextResponse.json({ ok: true, skipped: true })
    }
    await service.from('program_assets').update({
      ai_status: 'done',
      ai_summary: result.summary,
      ai_tags: result.tags,
    }).eq('id', assetId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Asset summarisation failed:', err)
    await service.from('program_assets').update({ ai_status: 'failed' }).eq('id', assetId)
    return NextResponse.json({ error: 'Summarisation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add "src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts"
  git commit -m "feat: programs phase 2 — summarise API route"
  ```

---

## Task 3: Asset creation defaults `ai_status` to `pending`

**Files:**
- Modify: `src/app/api/programs/[id]/assets/route.ts`

**Interfaces:**
- No new exports — internal behavior change only

- [ ] **Step 1: Update the note-creation branch**

Read `src/app/api/programs/[id]/assets/route.ts` first. In the `POST` handler's JSON body branch,
change the `note` insert's `ai_status` field:

```typescript
    if (asset_type === 'note') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const service = createServiceClient()
      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: 'note',
        name: name.trim(),
        note_content: note_content ?? '',
        ai_status: 'pending',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }
```

(Only the `ai_status: 'skipped'` → `ai_status: 'pending'` line changes in this block. The
`link`/`video` branch immediately below stays exactly as-is — `ai_status: 'skipped'`, unchanged.)

- [ ] **Step 2: Update the file-upload branch**

In the same file's file-upload section, change:

```typescript
  const { data, error } = await service.from('program_assets').insert({
    id: assetId,
    program_id: id,
    owner_id: user.id,
    category_id: categoryId || null,
    asset_type: assetType,
    name: customName || file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    ai_status: 'skipped',
  }).select().single()
```

to:

```typescript
  const { data, error } = await service.from('program_assets').insert({
    id: assetId,
    program_id: id,
    owner_id: user.id,
    category_id: categoryId || null,
    asset_type: assetType,
    name: customName || file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    ai_status: assetType === 'image' || assetType === 'pdf' ? 'pending' : 'skipped',
  }).select().single()
```

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add "src/app/api/programs/[id]/assets/route.ts"
  git commit -m "feat: programs phase 2 — ai_status defaults to pending for note/image/pdf"
  ```

---

## Task 4: Upload UI fires the summarise trigger

**Files:**
- Modify: `src/components/programs/AssetUploadZone.tsx`

**Interfaces:**
- Consumes: `POST /api/programs/[id]/assets/[assetId]/summarise` (Task 2)

- [ ] **Step 1: Add the trigger helper and call it from both eligible save paths**

Read `src/components/programs/AssetUploadZone.tsx` first. Add this helper function inside the
component (anywhere before `uploadFile`/`handleSaveNote` use it — e.g. right after the component's
opening state declarations):

```typescript
  function triggerSummarise(asset: ProgramAsset) {
    if (asset.asset_type === 'note' || asset.asset_type === 'image' || asset.asset_type === 'pdf') {
      fetch(`/api/programs/${programId}/assets/${asset.id}/summarise`, { method: 'POST' })
    }
  }
```

Then in `uploadFile`, add the trigger call right after `onAssetAdded(json as ProgramAsset)` and
before `onClose()`:

```typescript
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return }
    onAssetAdded(json as ProgramAsset)
    triggerSummarise(json as ProgramAsset)
    onClose()
```

And in `handleSaveNote`, the same insertion right after its `onAssetAdded(json as ProgramAsset)`:

```typescript
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onAssetAdded(json as ProgramAsset)
    triggerSummarise(json as ProgramAsset)
    onClose()
```

Do **not** add this to `handleSaveLink` — `link`/`video` assets are never eligible
(`triggerSummarise` would no-op for them anyway, but there's no need to call it there).

The `fetch(...)` call is deliberately **not awaited** — this is the fire-and-forget trigger; the
modal closes immediately as it does today.

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/programs/AssetUploadZone.tsx
  git commit -m "feat: programs phase 2 — fire-and-forget summarise trigger after upload"
  ```

---

## Task 5: AssetCard — tag pills + View AI summary popover

**Files:**
- Modify: `src/components/programs/AssetCard.tsx`

**Interfaces:**
- No new props — reads `asset.ai_status`/`asset.ai_tags`/`asset.ai_summary` (already on the
  `ProgramAsset` type)

- [ ] **Step 1: Replace the full file**

Replace the full contents of `src/components/programs/AssetCard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import {
  FileText, Image, Music, Link, BookOpen, FileSpreadsheet, File,
  MoreVertical, Trash2, ExternalLink, Sparkles, X,
} from 'lucide-react'
import type { ProgramAsset, ProgramAssetType } from '@/types/programs'

const TYPE_ICON: Record<ProgramAssetType, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf:   FileText,
  docx:  FileText,
  xlsx:  FileSpreadsheet,
  image: Image,
  audio: Music,
  video: Link,
  note:  BookOpen,
  link:  Link,
}

const TYPE_COLOUR: Record<ProgramAssetType, string> = {
  pdf:   '#ef4444',
  docx:  '#3b82f6',
  xlsx:  '#10b981',
  image: '#8b5cf6',
  audio: '#f59e0b',
  video: '#ec4899',
  note:  '#06b6d4',
  link:  '#64748b',
}

function fmtBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export default function AssetCard({
  asset,
  programId,
  canManage,
  onDeleted,
  onUpdated,
}: {
  asset: ProgramAsset
  programId: string
  canManage: boolean
  onDeleted: (id: string) => void
  onUpdated: (asset: ProgramAsset) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const Icon = TYPE_ICON[asset.asset_type] ?? File
  const colour = TYPE_COLOUR[asset.asset_type] ?? '#64748b'

  async function handleDelete() {
    if (!confirm(`Delete "${asset.name}"?`)) return
    setDeleting(true)
    await fetch(`/api/programs/${programId}/assets/${asset.id}`, { method: 'DELETE' })
    onDeleted(asset.id)
  }

  function handleOpen() {
    if (asset.signed_url) {
      window.open(asset.signed_url, '_blank')
    } else if (asset.external_url) {
      window.open(asset.external_url, '_blank')
    }
  }

  // suppress unused warning — onUpdated available for future rename flow
  void onUpdated

  const showKebab = canManage || !!asset.ai_summary

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-gray-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${colour}1a`, color: colour }}
      >
        <Icon size={20} />
      </div>

      <p className="mb-1 text-sm font-bold leading-snug text-gray-900 line-clamp-2 dark:text-slate-100">
        {asset.name}
      </p>

      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
        {asset.asset_type}
        {asset.file_size_bytes ? ` · ${fmtBytes(asset.file_size_bytes)}` : ''}
      </p>

      {asset.ai_status === 'done' && asset.ai_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {asset.ai_tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

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

      {showKebab && (
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setMenuOpen(m => !m)}
            className="hidden h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 group-hover:flex dark:text-slate-600 dark:hover:bg-slate-800"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {asset.ai_summary && (
                  <button
                    type="button"
                    onClick={() => { setShowSummary(true); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Sparkles size={12} />
                    View AI summary
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => { handleDelete(); setMenuOpen(false) }}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showSummary && asset.ai_summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowSummary(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">AI summary</h3>
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-700 dark:text-slate-300">{asset.ai_summary}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/programs/AssetCard.tsx
  git commit -m "feat: programs phase 2 — tag pills and View AI summary popover on AssetCard"
  ```

---

## Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`** — final clean check after all tasks.

- [ ] **Step 2: Manual browser smoke test** (no test runner in this project):
  1. Open a program's explorer, add a note asset with a few sentences of real content. Wait a
     few seconds, then refresh the page — confirm tag pills appear under the note's name and the
     kebab menu now has a "View AI summary" item showing a sensible summary.
  2. Upload an image (PDF too, if you have a small one handy) — same check after a refresh.
  3. Add a note with only a couple of words (under ~20 characters) — confirm it stays with no
     tags/summary (correctly skipped, no wasted API call).
  4. Upload a `docx` or `xlsx` file — confirm it behaves exactly as before this phase: no tags,
     no "View AI summary" option (still `ai_status: 'skipped'`, unchanged).
  5. As a regular (non-manager) org member if you have a second test account, confirm you can
     still see "View AI summary" on an asset with a summary, but not "Delete".

- [ ] **Step 3:** Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] Task 1: `summariseAsset()` compiles clean, handles note/image/pdf, returns null for others
- [ ] Task 2: summarise route sets processing → done/failed correctly
- [ ] Task 3: new note/image/pdf assets start at `ai_status: 'pending'`; other types unaffected
- [ ] Task 4: upload UI fires the trigger without awaiting it, non-eligible types don't trigger
- [ ] Task 5: tag pills + View AI summary popover render correctly, Delete still manager-only
- [ ] Task 6: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for Task 6 (no test runner in this project). This phase spends real (small)
money per summarised asset via the Claude API — already an accepted cost pattern in this
codebase (session-notes summarisation, AI assistant chat both already do this).
