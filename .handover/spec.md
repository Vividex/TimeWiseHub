# Programs Phase 2 — AI Summarisation

## Goal
Automatically generate a short summary and tags for `note`, `image`, and `pdf` program assets
using Claude, surfaced as tag pills on the card and a "View AI summary" popover.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-01-programs-phase2-ai-summarisation-design.md`
- Source plan: `docs/superpowers/plans/2026-07-01-programs-phase2-ai-summarisation.md`
- Only `note`/`image`/`pdf` get summarised. Every other type keeps `ai_status: 'skipped'`
  unchanged. No new DB migration — Phase 1's `ai_status`/`ai_summary`/`ai_tags` columns already
  exist, unused until now.
- Reuses the existing Claude client pattern exactly: `new Anthropic({ apiKey:
  process.env.ANTHROPIC_API_KEY })`, model `'claude-haiku-4-5-20251001'`, `max_tokens: 1024` —
  matching `src/app/api/video/notes/[callId]/summarise/route.ts` and
  `src/app/api/assistant/route.ts`. No new npm dependency (image/document content blocks are
  natively supported by the installed `@anthropic-ai/sdk` `^0.100.1`).
- Trigger: fire-and-forget request from the upload UI right after an eligible asset is created —
  same pattern as the existing auto-pay-run trigger (a genuine separate HTTP request the browser
  doesn't await, not an in-process fire-and-forget inside another serverless function).
- Failure handling: any error sets `ai_status: 'failed'` and stops. No retries.
- Spend: this phase makes real (small) Claude API calls per summarised asset — user confirmed
  proceeding 2026-07-01, same accepted cost pattern as session-notes/AI assistant.
- Codex handles text edits only; conductor (Claude) runs all shell/build/git (Windows: Codex's
  workspace-write sandbox cannot spawn subprocesses).
- Verification gate: `pnpm run build` (tsc + eslint) after every turn. No test runner.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- No DB migration needed this phase.
- C-6 needs a manual browser smoke test (no test runner) before ticking it done — this is the
  step where real Claude API calls actually happen.

---

## C-1 — Shared Claude summarisation module

*Codex edits:*
- [x] Create `src/lib/programs/summarise-asset.ts`:
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

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet — checks it compiles standalone.
- [x] Commit: `git add src/lib/programs/summarise-asset.ts && git commit -m "feat: programs phase 2 — shared Claude asset summarisation module"`

---

## C-2 — Summarise API route

*Codex edits:*
- [x] Create `src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts`:
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

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts" && git commit -m "feat: programs phase 2 — summarise API route"`

---

## C-3 — Asset creation defaults `ai_status` to `pending`

*Codex edits:*
- [x] Read `src/app/api/programs/[id]/assets/route.ts` first, then:
  - In the `note` insert of the JSON body branch, change `ai_status: 'skipped'` to
    `ai_status: 'pending'`. Leave the `link`/`video` branch immediately below untouched
    (`ai_status: 'skipped'`, unchanged).
  - In the file-upload branch's insert, change:
    ```typescript
    ai_status: 'skipped',
    ```
    to:
    ```typescript
    ai_status: assetType === 'image' || assetType === 'pdf' ? 'pending' : 'skipped',
    ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/programs/[id]/assets/route.ts" && git commit -m "feat: programs phase 2 — ai_status defaults to pending for note/image/pdf"`

---

## C-4 — Upload UI fires the summarise trigger

*Codex edits:*
- [x] Read `src/components/programs/AssetUploadZone.tsx` first, then:
  - Add this helper function inside the component (e.g. right after the state declarations):
    ```typescript
    function triggerSummarise(asset: ProgramAsset) {
      if (asset.asset_type === 'note' || asset.asset_type === 'image' || asset.asset_type === 'pdf') {
        fetch(`/api/programs/${programId}/assets/${asset.id}/summarise`, { method: 'POST' })
      }
    }
    ```
  - In `uploadFile`, add `triggerSummarise(json as ProgramAsset)` right after
    `onAssetAdded(json as ProgramAsset)` and before `onClose()`.
  - In `handleSaveNote`, add the same `triggerSummarise(json as ProgramAsset)` right after its
    `onAssetAdded(json as ProgramAsset)` and before `onClose()`.
  - Do NOT add this to `handleSaveLink` (link/video assets are never eligible).
  - The `fetch(...)` call is deliberately not awaited — fire-and-forget, matching the existing
    auto-pay-run trigger pattern.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/programs/AssetUploadZone.tsx && git commit -m "feat: programs phase 2 — fire-and-forget summarise trigger after upload"`

---

## C-5 — AssetCard: tag pills + View AI summary popover

*Codex edits:*
- [ ] Replace `src/components/programs/AssetCard.tsx` in full:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/programs/AssetCard.tsx && git commit -m "feat: programs phase 2 — tag pills and View AI summary popover on AssetCard"`

---

## C-6 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner) — **this is where real Claude API calls happen**:
  1. Add a note asset with a few real sentences of content. Wait a few seconds, refresh — confirm
     tag pills appear and the kebab menu has "View AI summary" showing a sensible summary.
  2. Upload an image (and a small PDF if available) — same check after a refresh.
  3. Add a note with only a couple of words (under ~20 characters) — confirm it stays with no
     tags/summary (correctly skipped, no wasted API call).
  4. Upload a `docx` or `xlsx` file — confirm it behaves exactly as before this phase (no tags,
     no "View AI summary", still `ai_status: 'skipped'`).
  5. If you have a second (non-manager) test account, confirm they can see "View AI summary" but
     not "Delete" on an asset with a summary.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: `summariseAsset()` compiles clean, handles note/image/pdf, returns null for others
- [x] C-2: summarise route sets processing → done/failed correctly
- [x] C-3: new note/image/pdf assets start at `ai_status: 'pending'`; other types unaffected
- [x] C-4: upload UI fires the trigger without awaiting it, non-eligible types don't trigger
- [ ] C-5: tag pills + View AI summary popover render correctly, Delete still manager-only
- [ ] C-6: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-6 (no test runner in this project). This phase spends real (small)
money per summarised asset via the Claude API — already accepted 2026-07-01.
