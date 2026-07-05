# Tutoring Topic File Uploads

## Goal
Let a tutor upload files, paste links, or add notes to a specific topic, and browse them from a
new dedicated Subjects/Topics page. Fifth deep-dive feature for the Tutoring workspace profile.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-topic-file-uploads-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-tutoring-topic-file-uploads.md`
- New `topic-assets` storage bucket + `topic_assets` table, modeled on the existing Programs
  feature's asset pattern (permissive storage-layer policies, real authorization enforced in
  application code since routes use the service-role client, signed URLs for reads) but simpler —
  no AI summarization, no categories.
- File types: pdf, docx, xlsx, image (same MIME detection as Programs minus video/audio), plus
  `note` (plain text) and `link` (external URL).
- Any org member can upload; only the creator or an org admin can delete — mirrors the
  `subjects`/`topics` RLS shape from the prior phase.
- Subjects/topics themselves are NOT editable from the new page — creation stays exclusively
  inline during session booking (already shipped). This phase only adds file management.
- Routes use the service-role client (needed to pair storage + DB operations atomically), so table
  RLS does NOT enforce authorization here — every route calls a `getTopicAccess()` helper
  explicitly before acting.
- New "Subjects" sidebar nav item — the first real use of Phase 4's `NavOverrides` mechanism
  (shipped inert, waiting for real signal): hidden via `hiddenHrefs` for every non-tutoring
  profile, shown by default for tutoring.
- Every task in this phase is purely additive (new files) except the nav task (append-only edits)
  — no intermediate red-build risk, unlike the prior phase.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).

---

## C-1 — Database migration: topic-assets bucket and topic_assets table

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-089-tutoring-topic-assets.sql`:
  ```sql
  insert into storage.buckets (id, name, public) values ('topic-assets', 'topic-assets', false);

  create policy "topic-assets: authenticated upload" on storage.objects for insert
    with check (bucket_id = 'topic-assets');
  create policy "topic-assets: authenticated read" on storage.objects for select
    using (bucket_id = 'topic-assets');
  create policy "topic-assets: authenticated delete" on storage.objects for delete
    using (bucket_id = 'topic-assets');

  create type public.topic_asset_type as enum ('pdf', 'docx', 'xlsx', 'image', 'link', 'note');

  create table public.topic_assets (
    id uuid primary key default gen_random_uuid(),
    topic_id uuid not null references public.topics on delete cascade,
    created_by uuid not null references public.profiles on delete cascade,
    name text not null,
    asset_type public.topic_asset_type not null,
    storage_path text,
    file_size_bytes bigint,
    mime_type text,
    external_url text,
    note_content text,
    created_at timestamptz not null default now()
  );

  alter table public.topic_assets enable row level security;

  create policy "Org members can view topic assets" on public.topic_assets for select
    using (exists (
      select 1 from public.topics t
      join public.subjects s on s.id = t.subject_id
      join public.organisation_members om on om.org_id = s.org_id
      where t.id = topic_assets.topic_id and om.user_id = auth.uid()
    ));

  create policy "Org admins can manage topic assets" on public.topic_assets for all
    using (exists (
      select 1 from public.topics t
      join public.subjects s on s.id = t.subject_id
      join public.organisation_members om on om.org_id = s.org_id
      where t.id = topic_assets.topic_id and om.user_id = auth.uid() and om.role in ('owner','admin')
    ));

  create policy "Creator can manage own topic assets" on public.topic_assets for all
    using (created_by = auth.uid());
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `tutoring_topic_assets`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select id, public from storage.buckets where id = 'topic-assets';
  ```
  Expected: 1 row, `public = false`.
  ```sql
  select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%topic-assets%';
  ```
  Expected: 3 rows.
  ```sql
  select table_name from information_schema.tables where table_schema = 'public' and table_name = 'topic_assets';
  ```
  Expected: 1 row.
  ```sql
  select policyname from pg_policies where schemaname = 'public' and tablename = 'topic_assets' order by policyname;
  ```
  Expected: 3 rows.
- [x] Commit: `git add supabase/schema-089-tutoring-topic-assets.sql && git commit -m "feat: tutoring topic file uploads — database migration"`

---

## C-2 — Storage and access helpers

*Codex edits:*
- [x] Write `src/lib/tutoring/topic-storage.ts`:
  ```typescript
  import { createServiceClient } from '@/lib/supabase-service'

  export function topicStoragePath(opts: {
    orgId: string | null
    userId: string
    topicId: string
    assetId: string
    filename: string
  }): string {
    const prefix = opts.orgId ? opts.orgId : `solo/${opts.userId}`
    return `${prefix}/${opts.topicId}/${opts.assetId}/${opts.filename}`
  }

  export async function createTopicAssetSignedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
    const service = createServiceClient()
    const { data } = await service.storage
      .from('topic-assets')
      .createSignedUrl(storagePath, expiresIn)
    return data?.signedUrl ?? null
  }

  export async function deleteTopicAssetFile(storagePath: string): Promise<void> {
    const service = createServiceClient()
    await service.storage.from('topic-assets').remove([storagePath])
  }
  ```
- [x] Write `src/lib/tutoring/topic-access.ts`:
  ```typescript
  import { createServiceClient } from '@/lib/supabase-service'

  export async function getTopicAccess(
    topicId: string,
    userId: string
  ): Promise<{ isMember: boolean; isAdmin: boolean } | null> {
    const service = createServiceClient()
    const { data: topic } = await service
      .from('topics')
      .select('id, subject_id, subjects(org_id, created_by)')
      .eq('id', topicId)
      .maybeSingle()
    if (!topic) return null
    const subject = (topic.subjects as unknown as { org_id: string | null; created_by: string } | null)
    if (!subject) return null

    if (subject.org_id === null) {
      return subject.created_by === userId ? { isMember: true, isAdmin: true } : null
    }

    const { data: membership } = await service
      .from('organisation_members').select('role').eq('user_id', userId).eq('org_id', subject.org_id).maybeSingle()
    if (!membership) return null
    return { isMember: true, isAdmin: ['owner', 'admin'].includes(membership.role as string) }
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean (not imported anywhere yet).
- [x] Commit: `git add src/lib/tutoring/topic-storage.ts src/lib/tutoring/topic-access.ts && git commit -m "feat: tutoring topic file uploads — storage and access helpers"`

---

## C-3 — API routes

*Codex edits:*
- [x] Write `src/app/api/topics/[id]/assets/route.ts`:
  ```typescript
  import { NextResponse } from 'next/server'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import { topicStoragePath } from '@/lib/tutoring/topic-storage'
  import { getTopicAccess } from '@/lib/tutoring/topic-access'

  const MAX_BYTES: Record<string, number> = {
    image: 10 * 1024 * 1024,
    default: 50 * 1024 * 1024,
  }

  function detectAssetType(mimeType: string): 'pdf' | 'docx' | 'xlsx' | 'image' | null {
    if (mimeType === 'application/pdf') return 'pdf'
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) return 'docx'
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) return 'xlsx'
    if (mimeType.startsWith('image/')) return 'image'
    return null
  }

  export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getTopicAccess(id, user.id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = createServiceClient()
    const { data, error } = await service
      .from('topic_assets').select('*').eq('topic_id', id).order('created_at')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getTopicAccess(id, user.id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = createServiceClient()
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      const { asset_type, name, note_content, external_url } = body

      if (asset_type === 'note') {
        if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
        const { data, error } = await service.from('topic_assets').insert({
          topic_id: id,
          created_by: user.id,
          asset_type: 'note',
          name: name.trim(),
          note_content: note_content ?? '',
        }).select().single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
      }

      if (asset_type === 'link') {
        if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
        if (!external_url?.trim()) return NextResponse.json({ error: 'URL required' }, { status: 400 })
        const { data, error } = await service.from('topic_assets').insert({
          topic_id: id,
          created_by: user.id,
          asset_type: 'link',
          name: name.trim(),
          external_url: external_url.trim(),
        }).select().single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
      }

      return NextResponse.json({ error: 'Invalid asset_type for JSON body' }, { status: 400 })
    }

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 415 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const customName = (formData.get('name') as string | null)?.trim()

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const assetType = detectAssetType(file.type)
    if (!assetType) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 422 })
    }

    const maxBytes = MAX_BYTES[assetType] ?? MAX_BYTES.default
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB for ${assetType}` },
        { status: 413 },
      )
    }

    const { data: topic } = await service.from('topics').select('subject_id').eq('id', id).maybeSingle()
    const { data: subject } = topic
      ? await service.from('subjects').select('org_id').eq('id', topic.subject_id).maybeSingle()
      : { data: null }

    const assetId = crypto.randomUUID()
    const storagePath = topicStoragePath({
      orgId: subject?.org_id ?? null,
      userId: user.id,
      topicId: id,
      assetId,
      filename: file.name,
    })

    const { error: uploadError } = await service.storage
      .from('topic-assets')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
    }

    const { data, error } = await service.from('topic_assets').insert({
      id: assetId,
      topic_id: id,
      created_by: user.id,
      asset_type: assetType,
      name: customName || file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: file.type,
    }).select().single()

    if (error) {
      await service.storage.from('topic-assets').remove([storagePath])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  }
  ```
- [x] Write `src/app/api/topics/[id]/assets/[assetId]/route.ts`:
  ```typescript
  import { NextResponse } from 'next/server'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import { deleteTopicAssetFile } from '@/lib/tutoring/topic-storage'
  import { getTopicAccess } from '@/lib/tutoring/topic-access'

  export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string; assetId: string }> },
  ) {
    const { id, assetId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getTopicAccess(id, user.id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = createServiceClient()
    const { data: asset } = await service
      .from('topic_assets').select('created_by, storage_path').eq('id', assetId).eq('topic_id', id).maybeSingle()
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (asset.created_by !== user.id && !access.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await service.from('topic_assets').delete().eq('id', assetId).eq('topic_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (asset.storage_path) {
      await deleteTopicAssetFile(asset.storage_path)
    }

    return NextResponse.json({ ok: true })
  }
  ```
- [x] Write `src/app/api/topics/[id]/assets/[assetId]/signed-url/route.ts`:
  ```typescript
  import { NextResponse } from 'next/server'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
  import { getTopicAccess } from '@/lib/tutoring/topic-access'

  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string; assetId: string }> },
  ) {
    const { id, assetId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getTopicAccess(id, user.id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = createServiceClient()
    const { data: asset } = await service
      .from('topic_assets').select('storage_path').eq('id', assetId).eq('topic_id', id).maybeSingle()

    if (!asset?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url = await createTopicAssetSignedUrl(asset.storage_path)
    if (!url) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })

    return NextResponse.json({ url })
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/topics/[id]/assets/route.ts" "src/app/api/topics/[id]/assets/[assetId]/route.ts" "src/app/api/topics/[id]/assets/[assetId]/signed-url/route.ts" && git commit -m "feat: tutoring topic file uploads — API routes"`

---

## C-4 — Subjects/Topics browser page

*Codex edits:*
- [x] Write `src/components/topics/TopicAssetsPanel.tsx`:
  ```typescript
  'use client'

  import { useEffect, useState } from 'react'
  import { FileText, Link as LinkIcon, StickyNote, Trash2 } from 'lucide-react'

  type Asset = {
    id: string
    name: string
    asset_type: 'pdf' | 'docx' | 'xlsx' | 'image' | 'link' | 'note'
    file_size_bytes: number | null
    external_url: string | null
  }

  const FILE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'image'])

  function fmtSize(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  export default function TopicAssetsPanel({ topicId }: { topicId: string }) {
    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)
    const [linkName, setLinkName] = useState('')
    const [linkUrl, setLinkUrl] = useState('')
    const [noteName, setNoteName] = useState('')
    const [noteContent, setNoteContent] = useState('')

    async function load() {
      setLoading(true)
      const res = await fetch(`/api/topics/${topicId}/assets`)
      const data = res.ok ? await res.json() as Asset[] : []
      setAssets(data)
      setLoading(false)
    }

    useEffect(() => { load() }, [topicId])

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      setError('')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/topics/${topicId}/assets`, { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Upload failed')
      } else {
        await load()
      }
      setUploading(false)
      e.target.value = ''
    }

    async function handleAddLink(e: React.FormEvent) {
      e.preventDefault()
      if (!linkName.trim() || !linkUrl.trim()) return
      const res = await fetch(`/api/topics/${topicId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: 'link', name: linkName.trim(), external_url: linkUrl.trim() }),
      })
      if (res.ok) { setLinkName(''); setLinkUrl(''); await load() }
    }

    async function handleAddNote(e: React.FormEvent) {
      e.preventDefault()
      if (!noteName.trim()) return
      const res = await fetch(`/api/topics/${topicId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: 'note', name: noteName.trim(), note_content: noteContent }),
      })
      if (res.ok) { setNoteName(''); setNoteContent(''); await load() }
    }

    async function handleDelete(assetId: string) {
      await fetch(`/api/topics/${topicId}/assets/${assetId}`, { method: 'DELETE' })
      await load()
    }

    async function handleView(assetId: string) {
      const res = await fetch(`/api/topics/${topicId}/assets/${assetId}/signed-url`)
      const data = res.ok ? await res.json() as { url: string } : null
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
    }

    return (
      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {assets.length === 0 && <p className="text-xs text-gray-400">No files yet.</p>}
            {assets.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                {FILE_TYPES.has(a.asset_type) ? (
                  <button
                    type="button"
                    onClick={() => handleView(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FileText size={14} className="shrink-0 text-cyan-600" />
                    <span className="truncate font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{fmtSize(a.file_size_bytes)}</span>
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {a.asset_type === 'link' ? <LinkIcon size={14} className="shrink-0 text-cyan-600" /> : <StickyNote size={14} className="shrink-0 text-cyan-600" />}
                    <span className="truncate font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
                    {a.asset_type === 'link' && a.external_url && (
                      <a href={a.external_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-cyan-600 hover:underline">Open</a>
                    )}
                  </div>
                )}
                <button type="button" onClick={() => handleDelete(a.id)} className="shrink-0 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-slate-800">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Upload a file</label>
            <input type="file" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" className="text-xs" />
          </div>

          <form onSubmit={handleAddLink} className="flex gap-2">
            <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Link name" className="w-1/3 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
            <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600">Add link</button>
          </form>

          <form onSubmit={handleAddNote} className="space-y-1">
            <input value={noteName} onChange={e => setNoteName(e.target.value)} placeholder="Note title" className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs" />
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Note content" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1 text-xs" />
            <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600">Add note</button>
          </form>
        </div>
      </div>
    )
  }
  ```
- [x] Write `src/components/topics/SubjectsBrowser.tsx`:
  ```typescript
  'use client'

  import { useState } from 'react'
  import { ChevronDown, ChevronRight } from 'lucide-react'
  import TopicAssetsPanel from './TopicAssetsPanel'

  type TopicItem = { id: string; name: string; year_group: string; assetCount: number }
  type SubjectItem = { id: string; name: string; topics: TopicItem[] }

  export default function SubjectsBrowser({ subjects }: { subjects: SubjectItem[] }) {
    const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)

    if (subjects.length === 0) {
      return <p className="text-sm text-gray-400 dark:text-slate-500">No subjects yet.</p>
    }

    return (
      <div className="space-y-6">
        {subjects.map(subject => (
          <div key={subject.id}>
            <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">{subject.name}</h2>
            {subject.topics.length === 0 ? (
              <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">No topics yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {subject.topics.map(topic => (
                  <li key={topic.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedTopicId(prev => prev === topic.id ? null : topic.id)}
                      className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2 text-left text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-cyan-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {expandedTopicId === topic.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span>{topic.year_group} · {topic.name}</span>
                      <span className="ml-auto text-xs font-normal text-gray-400">
                        {topic.assetCount} {topic.assetCount === 1 ? 'file' : 'files'}
                      </span>
                    </button>
                    {expandedTopicId === topic.id && <TopicAssetsPanel topicId={topic.id} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    )
  }
  ```
- [x] Write `src/app/dashboard/subjects/page.tsx`:
  ```typescript
  import { redirect } from 'next/navigation'
  import { createClient } from '@/lib/supabase-server'
  import SubjectsBrowser from '@/components/topics/SubjectsBrowser'

  export default async function SubjectsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: membership } = await supabase
      .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
    const orgId = membership?.org_id ?? null

    const subjectsQuery = orgId
      ? supabase.from('subjects').select('id, name, topics(id, name, year_group, archived)').eq('org_id', orgId).eq('archived', false).order('name')
      : supabase.from('subjects').select('id, name, topics(id, name, year_group, archived)').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
    const { data: subjectRows } = await subjectsQuery

    const allTopicIds = (subjectRows ?? []).flatMap(s =>
      (s.topics as { id: string; archived: boolean }[]).filter(t => !t.archived).map(t => t.id)
    )

    const assetCounts = new Map<string, number>()
    if (allTopicIds.length > 0) {
      const { data: assetRows } = await supabase.from('topic_assets').select('topic_id').in('topic_id', allTopicIds)
      for (const row of assetRows ?? []) {
        assetCounts.set(row.topic_id, (assetCounts.get(row.topic_id) ?? 0) + 1)
      }
    }

    const subjects = (subjectRows ?? []).map(s => ({
      id: s.id,
      name: s.name,
      topics: (s.topics as { id: string; name: string; year_group: string; archived: boolean }[])
        .filter(t => !t.archived)
        .map(t => ({ id: t.id, name: t.name, year_group: t.year_group, assetCount: assetCounts.get(t.id) ?? 0 })),
    }))

    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Subjects</h1>
          <SubjectsBrowser subjects={subjects} />
        </div>
      </div>
    )
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/subjects/page.tsx" src/components/topics/SubjectsBrowser.tsx src/components/topics/TopicAssetsPanel.tsx && git commit -m "feat: tutoring topic file uploads — subjects/topics browser page"`

---

## C-5 — Navigation wiring

*Codex edits:*
- [x] Edit `src/components/nav/SidebarNav.tsx` — change the `lucide-react` import line:
  ```typescript
  import {
    LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
    TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
    MessageSquare, Sparkles, CalendarRange, Users2, Video, ScrollText, Network, Library, type LucideIcon,
  } from 'lucide-react'
  ```
  to:
  ```typescript
  import {
    LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
    TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
    MessageSquare, Sparkles, CalendarRange, Users2, Video, ScrollText, Network, Library, BookOpen, type LucideIcon,
  } from 'lucide-react'
  ```
  and change the `Delivery` group:
  ```typescript
    { title: 'Delivery', items: [
      { label: 'Clients',   href: '/dashboard/clients',  icon: Users,    tutorialId: 'clients' },
      { label: 'Programs',  href: '/dashboard/programs', icon: Library },
      { label: 'Calendar',  href: '/dashboard/calendar', icon: CalendarDays },
      { label: 'Time',      href: '/dashboard/time',     icon: Clock,    tutorialId: 'time' },
    ] },
  ```
  to:
  ```typescript
    { title: 'Delivery', items: [
      { label: 'Clients',   href: '/dashboard/clients',  icon: Users,    tutorialId: 'clients' },
      { label: 'Programs',  href: '/dashboard/programs', icon: Library },
      { label: 'Subjects',  href: '/dashboard/subjects', icon: BookOpen },
      { label: 'Calendar',  href: '/dashboard/calendar', icon: CalendarDays },
      { label: 'Time',      href: '/dashboard/time',     icon: Clock,    tutorialId: 'time' },
    ] },
  ```
- [x] Edit `src/lib/workspace-profiles/registry.ts` — change:
  ```typescript
  export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
    generic: {
      key: 'generic',
      label: 'Other / Not Listed',
      terminology: GENERIC_TERMINOLOGY,
    },
    tutoring: {
      key: 'tutoring',
      label: 'Tutoring & Education',
      terminology: {
        client: { singular: 'Client', plural: 'Clients' },
        session: { singular: 'Lesson', plural: 'Lessons' },
        program: { singular: 'Course', plural: 'Courses' },
        project: { singular: 'Learning Plan', plural: 'Learning Plans' },
      },
    },
    personal_training: {
      key: 'personal_training',
      label: 'Personal Training & Fitness',
      terminology: {
        client: { singular: 'Member', plural: 'Members' },
        session: { singular: 'Appointment', plural: 'Appointments' },
        program: { singular: 'Training Plan', plural: 'Training Plans' },
        project: { singular: 'Package', plural: 'Packages' },
      },
    },
    builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY },
    trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY },
    consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY },
    healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY },
    real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY },
    cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY },
    creative_agencies: { key: 'creative_agencies', label: 'Creative Agencies & Marketing', terminology: GENERIC_TERMINOLOGY },
  }
  ```
  to:
  ```typescript
  const HIDE_SUBJECTS_NAV = { hiddenHrefs: ['/dashboard/subjects'] }

  export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
    generic: {
      key: 'generic',
      label: 'Other / Not Listed',
      terminology: GENERIC_TERMINOLOGY,
      navOverrides: HIDE_SUBJECTS_NAV,
    },
    tutoring: {
      key: 'tutoring',
      label: 'Tutoring & Education',
      terminology: {
        client: { singular: 'Client', plural: 'Clients' },
        session: { singular: 'Lesson', plural: 'Lessons' },
        program: { singular: 'Course', plural: 'Courses' },
        project: { singular: 'Learning Plan', plural: 'Learning Plans' },
      },
    },
    personal_training: {
      key: 'personal_training',
      label: 'Personal Training & Fitness',
      terminology: {
        client: { singular: 'Member', plural: 'Members' },
        session: { singular: 'Appointment', plural: 'Appointments' },
        program: { singular: 'Training Plan', plural: 'Training Plans' },
        project: { singular: 'Package', plural: 'Packages' },
      },
      navOverrides: HIDE_SUBJECTS_NAV,
    },
    builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
    creative_agencies: { key: 'creative_agencies', label: 'Creative Agencies & Marketing', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: "Subjects" appears in the sidebar under Delivery; visiting
  `/dashboard/subjects` shows subjects/topics with file counts; expand a topic, upload a PDF,
  confirm it opens via signed URL; add a note and a link, confirm both display correctly; delete
  a file, confirm it's removed and the count updates; a second non-admin org member can upload
  their own files and delete their own uploads but not someone else's; switching the account's
  Industry to a non-tutoring profile hides "Subjects" from the sidebar, switching back to
  Tutoring shows it again (don't leave the real account's industry changed afterward).
- [ ] Commit: `git add src/components/nav/SidebarNav.tsx src/lib/workspace-profiles/registry.ts && git commit -m "feat: tutoring topic file uploads — navigation wiring"`

---

## Acceptance checklist
- [ ] C-1: `topic-assets` bucket + `topic_assets` table + RLS applied and verified
- [ ] C-2: storage/access helpers shipped, build passes
- [ ] C-3: API routes shipped, build passes
- [ ] C-4: subjects/topics browser page shipped, build passes
- [ ] C-5: nav wiring shipped, build passes, manual smoke confirms full flow

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser smoke required for C-5.
