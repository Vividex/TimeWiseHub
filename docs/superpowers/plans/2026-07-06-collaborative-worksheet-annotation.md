# Collaborative Worksheet Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tutor and student place text answers, freehand strokes, and stickers on a shared
fixed-layout worksheet (PDF/image), live during a video call or asynchronously afterward, with
each object appearing on the other person's screen in real time.

**Architecture:** One new table (`worksheet_annotations`) holding discrete, independently-owned
objects (no CRDT). A Supabase Realtime **Broadcast** channel per worksheet attempt carries live
updates; a debounced write persists to the table separately. One reusable `WorksheetAnnotator`
component is used from two entry points — an in-call panel tab, and a modal opened from the
existing Subjects page — so there is exactly one annotation experience, not two.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (`@supabase/ssr`,
Realtime Broadcast), Tailwind v4, `react-pdf` (new), `perfect-freehand` (new), lucide-react.

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean after every
  task — no test runner in this project.
- Package manager: pnpm. Windows dev machine; shell is PowerShell (Bash tool also available).
- Supabase queries in this codebase are not strictly schema-typed (no generated `Database` type)
  — `as unknown as { ... }` casts are the established pattern for single-row foreign-key joins.
- Migrations are committed as `supabase/schema-NNN-<name>.sql` and applied via Supabase MCP
  `apply_migration` — the file and the applied migration must stay in sync.
- New dependencies `react-pdf` and `perfect-freehand`: both free/open-source (MIT), no ongoing
  cost, confirmed with the user — flagged, not gated.
- Source spec: `docs/superpowers/specs/2026-07-06-collaborative-worksheet-annotation-design.md`

---

### Task 1: Database migration — table, storage, RLS

*Conductor only (no Codex dispatch) — DB migration via Supabase MCP.*

**Files:**
- Create: `supabase/schema-092-worksheet-annotations.sql`

**Interfaces:**
- Produces: table `public.worksheet_annotations`, function `public.can_edit_worksheet(uuid, uuid)
  returns boolean`, storage bucket `worksheet-stickers`. Every later task's RLS/access assumptions
  depend on this function's exact name and two-argument signature
  `(p_topic_asset_id uuid, p_student_id uuid)`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 092: Collaborative worksheet annotation
-- Lets a tutor and student place text/stroke/sticker objects on a
-- shared topic_assets PDF/image, live or async. Run via Supabase MCP
-- apply_migration (name: worksheet_annotations)
-- ============================================================

create type public.worksheet_object_type as enum ('text_box', 'stroke', 'sticker');

create table public.worksheet_annotations (
  id             uuid primary key default gen_random_uuid(),
  topic_asset_id uuid not null references public.topic_assets on delete cascade,
  student_id     uuid not null references public.students on delete cascade,
  page_number    integer not null default 1,
  object_type    public.worksheet_object_type not null,
  x              numeric(6,5) not null,
  y              numeric(6,5) not null,
  width          numeric(6,5) not null,
  height         numeric(6,5) not null,
  content        jsonb not null,
  created_by     uuid not null references public.profiles on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index worksheet_annotations_scope
  on public.worksheet_annotations (topic_asset_id, student_id, created_at);

alter table public.worksheet_annotations enable row level security;

-- Resolves access via topic_assets -> topics -> subjects (org OR solo creator),
-- OR via the specific guest identity tied to the client who owns the student.
-- Mirrors src/lib/tutoring/topic-access.ts (org/solo branching) and
-- can_post_chat() (guest branching) — see schema-078-session-chat.sql.
create or replace function public.can_edit_worksheet(p_topic_asset_id uuid, p_student_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_org_id uuid;
  v_subject_created_by uuid;
  v_client_id uuid;
  v_guest_user_id uuid;
begin
  select s.org_id, s.created_by into v_org_id, v_subject_created_by
  from public.topic_assets ta
  join public.topics t on t.id = ta.topic_id
  join public.subjects s on s.id = t.subject_id
  where ta.id = p_topic_asset_id;

  if v_org_id is null and v_subject_created_by is null then
    return false;
  end if;

  if v_org_id is not null then
    if exists (
      select 1 from public.organisation_members om
      where om.org_id = v_org_id and om.user_id = auth.uid()
    ) then
      return true;
    end if;
  else
    if v_subject_created_by = auth.uid() then
      return true;
    end if;
  end if;

  select client_id into v_client_id from public.students where id = p_student_id;
  if v_client_id is null then return false; end if;

  select guest_chat_user_id into v_guest_user_id from public.clients where id = v_client_id;
  if v_guest_user_id is not null and v_guest_user_id = auth.uid() then
    return true;
  end if;

  return false;
end;
$$;

create policy "Can view worksheet annotations" on public.worksheet_annotations for select
  using (public.can_edit_worksheet(topic_asset_id, student_id));

create policy "Can manage worksheet annotations" on public.worksheet_annotations for all
  using (public.can_edit_worksheet(topic_asset_id, student_id))
  with check (public.can_edit_worksheet(topic_asset_id, student_id));

-- Storage bucket for ad hoc uploaded stickers. Path convention:
-- {topicAssetId}/{studentId}/{filename} — lets a storage policy resolve
-- access via the same can_edit_worksheet() function using path segments.
insert into storage.buckets (id, name, public) values ('worksheet-stickers', 'worksheet-stickers', false);

create policy "worksheet-stickers: read with access" on storage.objects for select
  using (
    bucket_id = 'worksheet-stickers'
    and public.can_edit_worksheet(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

create policy "worksheet-stickers: upload with access" on storage.objects for insert
  with check (
    bucket_id = 'worksheet-stickers'
    and public.can_edit_worksheet(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `apply_migration` with `name: worksheet_annotations` and the SQL above.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'worksheet_annotations';
```
Expected: 1 row.

```sql
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'can_edit_worksheet';
```
Expected: 1 row.

```sql
select id from storage.buckets where id = 'worksheet-stickers';
```
Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-092-worksheet-annotations.sql
git commit -m "feat: worksheet annotation — database migration"
```

---

### Task 2: Dependencies, shared types, and lib helpers

**Files:**
- Modify: `package.json` (add `react-pdf`, `perfect-freehand`)
- Create: `public/pdf.worker.min.mjs`
- Create: `src/types/worksheets.ts`
- Create: `src/lib/worksheets/annotations.ts`
- Create: `src/lib/worksheets/stickers.ts`

**Interfaces:**
- Produces: types `WorksheetAnnotation`, `WorksheetObjectType`, `TextBoxContent`,
  `StrokeContent`, `StickerContent` (from `src/types/worksheets.ts`); functions
  `worksheetChannelName(topicAssetId, studentId): string`, `fetchAnnotations(topicAssetId,
  studentId): Promise<WorksheetAnnotation[]>`, `insertAnnotation(row: NewAnnotation):
  Promise<WorksheetAnnotation>`, `updateAnnotationContent(id, content): Promise<void>`,
  `deleteAnnotation(id): Promise<void>` (from `src/lib/worksheets/annotations.ts`); constant
  `BUILTIN_STICKERS: { id: string; label: string; icon: LucideIcon; color: string }[]` (from
  `src/lib/worksheets/stickers.ts`). Task 3 consumes all of these by exact name.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add react-pdf perfect-freehand
```

- [ ] **Step 2: Self-host the pdf.js worker (version-matched, avoids a runtime CDN dependency)**

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

- [ ] **Step 3: Write `src/types/worksheets.ts`**

```typescript
export type WorksheetObjectType = 'text_box' | 'stroke' | 'sticker'

export type TextBoxContent = { kind: 'text_box'; text: string }
export type StrokeContent = { kind: 'stroke'; points: [number, number][]; color: string; strokeWidth: number }
export type StickerContent =
  | { kind: 'sticker_builtin'; id: string }
  | { kind: 'sticker_custom'; storagePath: string }

export type AnnotationContent = TextBoxContent | StrokeContent | StickerContent

export type WorksheetAnnotation = {
  id: string
  topic_asset_id: string
  student_id: string
  page_number: number
  object_type: WorksheetObjectType
  x: number
  y: number
  width: number
  height: number
  content: AnnotationContent
  created_by: string
  created_at: string
  updated_at: string
}

export type NewWorksheetAnnotation = Omit<WorksheetAnnotation, 'id' | 'created_at' | 'updated_at'>
```

- [ ] **Step 4: Write `src/lib/worksheets/annotations.ts`**

```typescript
import { createClient } from '@/lib/supabase-browser'
import type { AnnotationContent, NewWorksheetAnnotation, WorksheetAnnotation } from '@/types/worksheets'

export function worksheetChannelName(topicAssetId: string, studentId: string): string {
  return `worksheet:${topicAssetId}:${studentId}`
}

export async function fetchAnnotations(topicAssetId: string, studentId: string): Promise<WorksheetAnnotation[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('worksheet_annotations')
    .select('*')
    .eq('topic_asset_id', topicAssetId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as WorksheetAnnotation[]
}

export async function insertAnnotation(row: NewWorksheetAnnotation): Promise<WorksheetAnnotation> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('worksheet_annotations')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as WorksheetAnnotation
}

export async function updateAnnotationContent(id: string, content: AnnotationContent): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('worksheet_annotations')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAnnotation(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('worksheet_annotations').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 5: Write `src/lib/worksheets/stickers.ts`**

Builtin stickers render as colored lucide-react icons rather than bundled image files — avoids
sourcing/shipping binary sticker assets while keeping the same `{ kind: 'sticker_builtin', id }`
content shape; a custom-uploaded sticker (Task 5) uses a real image via `sticker_custom` instead.

```typescript
import { Star, Check, X, Smile, Heart, ThumbsUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type BuiltinSticker = { id: string; label: string; icon: LucideIcon; color: string }

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  { id: 'star',     label: 'Star',      icon: Star,     color: '#f59e0b' },
  { id: 'check',    label: 'Correct',   icon: Check,    color: '#10b981' },
  { id: 'cross',    label: 'Incorrect', icon: X,        color: '#ef4444' },
  { id: 'smile',    label: 'Smile',     icon: Smile,    color: '#eab308' },
  { id: 'heart',    label: 'Heart',     icon: Heart,    color: '#ec4899' },
  { id: 'thumbsup', label: 'Great job', icon: ThumbsUp, color: '#3b82f6' },
]

export function findBuiltinSticker(id: string): BuiltinSticker | undefined {
  return BUILTIN_STICKERS.find(s => s.id === id)
}
```

- [ ] **Step 6: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml public/pdf.worker.min.mjs src/types/worksheets.ts src/lib/worksheets/annotations.ts src/lib/worksheets/stickers.ts
git commit -m "feat: worksheet annotation — dependencies, types, and data helpers"
```

---

### Task 3: WorksheetAnnotator core component

**Files:**
- Create: `src/components/worksheets/WorksheetAnnotator.tsx`
- Create: `src/components/worksheets/StickerPalette.tsx`

**Interfaces:**
- Consumes: everything from Task 2 (`WorksheetAnnotation`, `AnnotationContent`,
  `fetchAnnotations`, `insertAnnotation`, `updateAnnotationContent`, `worksheetChannelName`,
  `BUILTIN_STICKERS`, `findBuiltinSticker`).
- Produces: `WorksheetAnnotator` component with props `{ topicAssetId: string; studentId: string;
  fileUrl: string; assetType: 'pdf' | 'image'; currentUserId: string }` — Tasks 4 and 6 render
  this component directly with these exact prop names.

- [ ] **Step 1: Write `src/components/worksheets/StickerPalette.tsx`**

```typescript
'use client'

import { BUILTIN_STICKERS } from '@/lib/worksheets/stickers'

export default function StickerPalette({ onPick }: { onPick: (stickerId: string) => void }) {
  return (
    <div className="flex gap-2 p-2">
      {BUILTIN_STICKERS.map(s => {
        const Icon = s.icon
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            title={s.label}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700"
            style={{ color: s.color }}
          >
            <Icon size={18} />
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/worksheets/WorksheetAnnotator.tsx`**

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import getStroke from 'perfect-freehand'
import { Type, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { fetchAnnotations, insertAnnotation, updateAnnotationContent, deleteAnnotation, worksheetChannelName } from '@/lib/worksheets/annotations'
import { findBuiltinSticker } from '@/lib/worksheets/stickers'
import StickerPalette from './StickerPalette'
import type { AnnotationContent, WorksheetAnnotation } from '@/types/worksheets'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type Tool = 'text' | 'pen' | 'sticker' | null

function strokeToPath(points: [number, number][]): string {
  const outline = getStroke(points, { size: 3 })
  if (outline.length === 0) return ''
  return outline.reduce((acc, [x, y], i) => `${acc}${i === 0 ? 'M' : 'L'}${x},${y} `, '') + 'Z'
}

export default function WorksheetAnnotator({
  topicAssetId,
  studentId,
  fileUrl,
  assetType,
  currentUserId,
}: {
  topicAssetId: string
  studentId: string
  fileUrl: string
  assetType: 'pdf' | 'image'
  currentUserId: string
}) {
  const [annotations, setAnnotations] = useState<WorksheetAnnotation[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [tool, setTool] = useState<Tool>(null)
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([])
  const pageRef = useRef<HTMLDivElement>(null)
  const textDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAnnotations(topicAssetId, studentId).then(rows => {
      if (!cancelled) setAnnotations(rows)
    })
    return () => { cancelled = true }
  }, [topicAssetId, studentId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(worksheetChannelName(topicAssetId, studentId))
    channel
      .on('broadcast', { event: 'upsert' }, ({ payload }) => {
        const row = payload as WorksheetAnnotation
        setAnnotations(prev => {
          const idx = prev.findIndex(a => a.id === row.id)
          if (idx === -1) return [...prev, row]
          const next = [...prev]
          next[idx] = row
          return next
        })
      })
      .on('broadcast', { event: 'delete' }, ({ payload }) => {
        const { id } = payload as { id: string }
        setAnnotations(prev => prev.filter(a => a.id !== id))
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [topicAssetId, studentId])

  function broadcastUpsert(row: WorksheetAnnotation) {
    channelRef.current?.send({ type: 'broadcast', event: 'upsert', payload: row })
  }

  async function handleDeleteAnnotation(id: string) {
    setAnnotations(prev => prev.filter(a => a.id !== id))
    channelRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
    await deleteAnnotation(id)
  }

  function relativePosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'text' && tool !== 'sticker') return
    const { x, y } = relativePosition(e.clientX, e.clientY)

    const content: AnnotationContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }

    const saved = await insertAnnotation({
      topic_asset_id: topicAssetId,
      student_id: studentId,
      page_number: pageNumber,
      object_type: tool === 'text' ? 'text_box' : 'sticker',
      x, y, width: tool === 'text' ? 0.2 : 0.06, height: tool === 'text' ? 0.05 : 0.06,
      content,
      created_by: currentUserId,
    })
    setAnnotations(prev => [...prev, saved])
    broadcastUpsert(saved)
    setTool(null)
  }, [tool, pageNumber, topicAssetId, studentId, currentUserId])

  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (tool !== 'pen') return
    const { x, y } = relativePosition(e.clientX, e.clientY)
    setDrawingPoints([[x, y]])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (tool !== 'pen' || drawingPoints.length === 0) return
    const { x, y } = relativePosition(e.clientX, e.clientY)
    setDrawingPoints(prev => [...prev, [x, y]])
  }

  async function handlePointerUp() {
    if (tool !== 'pen' || drawingPoints.length < 2) { setDrawingPoints([]); return }
    const xs = drawingPoints.map(p => p[0])
    const ys = drawingPoints.map(p => p[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    const normalised: [number, number][] = drawingPoints.map(([x, y]) => [x - minX, y - minY])

    const saved = await insertAnnotation({
      topic_asset_id: topicAssetId,
      student_id: studentId,
      page_number: pageNumber,
      object_type: 'stroke',
      x: minX, y: minY, width: Math.max(maxX - minX, 0.01), height: Math.max(maxY - minY, 0.01),
      content: { kind: 'stroke', points: normalised, color: '#ef4444', strokeWidth: 3 },
      created_by: currentUserId,
    })
    setAnnotations(prev => [...prev, saved])
    broadcastUpsert(saved)
    setDrawingPoints([])
  }

  function handleTextChange(annotation: WorksheetAnnotation, text: string) {
    const updated: WorksheetAnnotation = { ...annotation, content: { kind: 'text_box', text } }
    setAnnotations(prev => prev.map(a => (a.id === annotation.id ? updated : a)))
    broadcastUpsert(updated)

    clearTimeout(textDebounceRef.current[annotation.id])
    textDebounceRef.current[annotation.id] = setTimeout(() => {
      updateAnnotationContent(annotation.id, updated.content)
    }, 500)
  }

  const pageAnnotations = annotations.filter(a => a.page_number === pageNumber)

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-800 p-2">
        <button
          type="button"
          onClick={() => setTool(tool === 'text' ? null : 'text')}
          className={`rounded-lg p-2 ${tool === 'text' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Add text"
        >
          <Type size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'pen' ? null : 'pen')}
          className={`rounded-lg p-2 ${tool === 'pen' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Draw"
        >
          <Pencil size={16} />
        </button>
        <StickerPalette onPick={id => { setPendingStickerId(id); setTool('sticker') }} />
        {assetType === 'pdf' && numPages > 1 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <button type="button" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>‹</button>
            Page {pageNumber} / {numPages}
            <button type="button" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>›</button>
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        <div
          ref={pageRef}
          className="relative mx-auto bg-white"
          style={{ width: 800, cursor: tool ? 'crosshair' : 'default' }}
          onClick={handlePageClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {assetType === 'pdf' ? (
            <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
              <Page pageNumber={pageNumber} width={800} />
            </Document>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt="Worksheet" style={{ width: 800, display: 'block' }} />
          )}

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {pageAnnotations
              .filter(a => a.object_type === 'stroke')
              .map(a => {
                const c = a.content as { kind: 'stroke'; points: [number, number][]; color: string }
                const scaled: [number, number][] = c.points.map(([x, y]) => [
                  (a.x + x * a.width) * 800,
                  (a.y + y * a.height) * 800,
                ])
                return <path key={a.id} d={strokeToPath(scaled)} fill={c.color} />
              })}
            {drawingPoints.length > 1 && (
              <path d={strokeToPath(drawingPoints.map(([x, y]) => [x * 800, y * 800]))} fill="#ef4444" />
            )}
          </svg>

          {pageAnnotations
            .filter(a => a.object_type === 'text_box')
            .map(a => {
              const c = a.content as { kind: 'text_box'; text: string }
              return (
                <div
                  key={a.id}
                  className="group absolute"
                  style={{ left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px` }}
                >
                  <textarea
                    value={c.text}
                    onChange={e => handleTextChange(a, e.target.value)}
                    className="h-full w-full resize-none border border-cyan-400 bg-white/90 p-1 text-sm text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(a.id)}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )
            })}

          {pageAnnotations
            .filter(a => a.object_type === 'sticker')
            .map(a => {
              const c = a.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              if (c.kind !== 'sticker_builtin') return null
              const sticker = findBuiltinSticker(c.id)
              if (!sticker) return null
              const Icon = sticker.icon
              return (
                <div
                  key={a.id}
                  className="group absolute flex items-center justify-center"
                  style={{ left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px`, color: sticker.color }}
                >
                  <Icon size={28} />
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(a.id)}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean. If `react-pdf`/`pdfjs-dist` types complain about the worker import, confirm
`pdfjs.GlobalWorkerOptions.workerSrc` is set before any `<Document>` renders (module-level
assignment above satisfies this).

- [ ] **Step 4: Commit**

```bash
git add src/components/worksheets/WorksheetAnnotator.tsx src/components/worksheets/StickerPalette.tsx
git commit -m "feat: worksheet annotation — core annotator component"
```

---

### Task 4: Async entry point — Subjects page "Annotate" action

**Files:**
- Create: `src/components/worksheets/WorksheetAnnotatorModal.tsx`
- Modify: `src/components/topics/TopicAssetsPanel.tsx`

**Interfaces:**
- Consumes: `WorksheetAnnotator` (Task 3) with its exact prop names.
- Produces: `WorksheetAnnotatorModal` component with props `{ topicAssetId: string; assetType:
  'pdf' | 'image'; fileUrl: string; currentUserId: string; onClose: () => void }` — self-contained,
  fetches its own student list and asset URL where needed.

- [ ] **Step 1: Write `src/components/worksheets/WorksheetAnnotatorModal.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import WorksheetAnnotator from './WorksheetAnnotator'

type StudentOption = { id: string; name: string }

export default function WorksheetAnnotatorModal({
  topicAssetId,
  assetType,
  fileUrl,
  currentUserId,
  onClose,
}: {
  topicAssetId: string
  assetType: 'pdf' | 'image'
  fileUrl: string
  currentUserId: string
  onClose: () => void
}) {
  const [students, setStudents] = useState<StudentOption[]>([])
  const [studentId, setStudentId] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('students')
      .select('id, name')
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setStudents((data ?? []) as StudentOption[]))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          {studentId ? (
            <span className="text-sm font-semibold text-slate-200">
              Annotating: {students.find(s => s.id === studentId)?.name}
            </span>
          ) : (
            <select
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
            >
              <option value="">Select a student…</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {studentId ? (
            <WorksheetAnnotator
              topicAssetId={topicAssetId}
              studentId={studentId}
              fileUrl={fileUrl}
              assetType={assetType}
              currentUserId={currentUserId}
            />
          ) : (
            <p className="p-4 text-sm text-slate-400">Choose a student to open their attempt.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

(the student picker relies on RLS to scope the list to the current user's own org/clients — no
explicit org filter needed, matching how `worksheet_annotations` itself relies on
`can_edit_worksheet` rather than a client-side org filter)

- [ ] **Step 2: Wire it into `TopicAssetsPanel.tsx`**

Read `src/components/topics/TopicAssetsPanel.tsx` (reproduced in full in Task-3-adjacent context
above; re-read if it has changed since planning). Add the import and state:

```typescript
import { useEffect, useState } from 'react'
import { FileText, Link as LinkIcon, StickyNote, Trash2, PenSquare } from 'lucide-react'
import WorksheetAnnotatorModal from '@/components/worksheets/WorksheetAnnotatorModal'
import { createClient } from '@/lib/supabase-browser'
```

Add state inside the component, alongside the existing `useState` calls:

```typescript
  const [annotatingAsset, setAnnotatingAsset] = useState<{ id: string; assetType: 'pdf' | 'image' } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
  }, [])

  async function handleAnnotate(assetId: string, assetType: 'pdf' | 'image') {
    const res = await fetch(`/api/topics/${topicId}/assets/${assetId}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) setAnnotatingAsset({ id: assetId, assetType })
  }
```

Change the asset row's file button block from:
```typescript
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
```
to:
```typescript
              {FILE_TYPES.has(a.asset_type) ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleView(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FileText size={14} className="shrink-0 text-cyan-600" />
                    <span className="truncate font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{fmtSize(a.file_size_bytes)}</span>
                  </button>
                  {(a.asset_type === 'pdf' || a.asset_type === 'image') && (
                    <button
                      type="button"
                      onClick={() => handleAnnotate(a.id, a.asset_type as 'pdf' | 'image')}
                      className="shrink-0 text-gray-400 hover:text-cyan-600"
                      title="Annotate"
                    >
                      <PenSquare size={14} />
                    </button>
                  )}
                </>
              ) : (
```

Add the modal render at the end of the component's returned JSX, just before the final closing
`</div>` of the root element:

```typescript
      {annotatingAsset && currentUserId && (
        <WorksheetAnnotatorModalLoader
          topicId={topicId}
          assetId={annotatingAsset.id}
          assetType={annotatingAsset.assetType}
          currentUserId={currentUserId}
          onClose={() => setAnnotatingAsset(null)}
        />
      )}
```

Since the modal needs a signed URL (async) before it can render `WorksheetAnnotator`, add this
small loader component in the same file, above the default export:

```typescript
function WorksheetAnnotatorModalLoader({
  topicId, assetId, assetType, currentUserId, onClose,
}: {
  topicId: string; assetId: string; assetType: 'pdf' | 'image'; currentUserId: string; onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/topics/${topicId}/assets/${assetId}/signed-url`)
      .then(res => res.ok ? res.json() as Promise<{ url: string }> : null)
      .then(data => setUrl(data?.url ?? null))
  }, [topicId, assetId])
  if (!url) return null
  return (
    <WorksheetAnnotatorModal
      topicAssetId={assetId}
      assetType={assetType}
      fileUrl={url}
      currentUserId={currentUserId}
      onClose={onClose}
    />
  )
}
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Manual smoke test**

On `/dashboard/subjects`, drill into a topic with an uploaded PDF or image worksheet. Click the
new pen-square "Annotate" icon, pick a student, confirm the worksheet renders. Add a text answer,
draw a stroke, and place a builtin sticker. Hover the sticker and confirm the small delete button
appears; click it and confirm the sticker disappears and stays gone after a reload. Close the
modal, reopen the same worksheet + same student, and confirm the remaining text box and stroke are
still there. Pick a *different* student and confirm the worksheet appears blank (no cross-student
bleed).

- [ ] **Step 5: Commit**

```bash
git add src/components/worksheets/WorksheetAnnotatorModal.tsx src/components/topics/TopicAssetsPanel.tsx
git commit -m "feat: worksheet annotation — async entry point from Subjects page"
```

---

### Task 5: Custom sticker upload

**Files:**
- Modify: `src/components/worksheets/StickerPalette.tsx`
- Modify: `src/components/worksheets/WorksheetAnnotator.tsx`

**Interfaces:**
- Consumes: storage bucket `worksheet-stickers` and its path-based RLS policies (Task 1).
- Produces: `StickerPalette` gains an `onUploadCustom: (storagePath: string) => void` prop; no
  change to any other task's interface.

- [ ] **Step 1: Add upload UI to `StickerPalette.tsx`**

```typescript
'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { BUILTIN_STICKERS } from '@/lib/worksheets/stickers'
import { createClient } from '@/lib/supabase-browser'

export default function StickerPalette({
  topicAssetId,
  studentId,
  onPick,
  onUploadCustom,
}: {
  topicAssetId: string
  studentId: string
  onPick: (stickerId: string) => void
  onUploadCustom: (storagePath: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const storagePath = `${topicAssetId}/${studentId}/${crypto.randomUUID()}-${file.name}`
    const supabase = createClient()
    const { error } = await supabase.storage.from('worksheet-stickers').upload(storagePath, file)
    if (!error) onUploadCustom(storagePath)
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-2 p-2">
      {BUILTIN_STICKERS.map(s => {
        const Icon = s.icon
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            title={s.label}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700"
            style={{ color: s.color }}
          >
            <Icon size={18} />
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Upload a custom sticker"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
      >
        <Upload size={16} />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  )
}
```

- [ ] **Step 2: Wire the new props and content shape into `WorksheetAnnotator.tsx`**

Change the `<StickerPalette onPick={...} />` usage to:
```typescript
        <StickerPalette
          topicAssetId={topicAssetId}
          studentId={studentId}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />
```

Add the new state near `pendingStickerId`:
```typescript
  const [pendingCustomSticker, setPendingCustomSticker] = useState<string | null>(null)
```

Change the content-building branch inside `handlePageClick` from:
```typescript
    const content: AnnotationContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }
```
to:
```typescript
    const content: AnnotationContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : pendingCustomSticker
        ? { kind: 'sticker_custom', storagePath: pendingCustomSticker }
        : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }
```

Reset both pending-sticker states at the end of `handlePageClick`, alongside the existing
`setTool(null)`:
```typescript
    setTool(null)
    setPendingStickerId(null)
    setPendingCustomSticker(null)
```

`worksheet-stickers` is a **private** bucket (Task 1) — a custom sticker needs a signed URL, not
a public one. Add this state and effect near the other `useState`/`useEffect` calls in
`WorksheetAnnotator.tsx` (fetches a signed URL once per custom sticker path and caches it):

```typescript
  const [customStickerUrls, setCustomStickerUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const customPaths = annotations
      .filter(a => a.object_type === 'sticker' && (a.content as { kind: string }).kind === 'sticker_custom')
      .map(a => (a.content as { kind: 'sticker_custom'; storagePath: string }).storagePath)
      .filter(p => !customStickerUrls[p])
    if (customPaths.length === 0) return
    const supabase = createClient()
    Promise.all(customPaths.map(p => supabase.storage.from('worksheet-stickers').createSignedUrl(p, 3600)))
      .then(results => {
        setCustomStickerUrls(prev => {
          const next = { ...prev }
          results.forEach((r, i) => { if (r.data) next[customPaths[i]] = r.data.signedUrl })
          return next
        })
      })
  }, [annotations, customStickerUrls])
```

Then add rendering support for `sticker_custom` in the sticker-rendering `.map()` — change:
```typescript
              const c = a.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              if (c.kind !== 'sticker_builtin') return null
              const sticker = findBuiltinSticker(c.id)
              if (!sticker) return null
              const Icon = sticker.icon
              return (
                <div
                  key={a.id}
                  className="group absolute flex items-center justify-center"
                  style={{ left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px`, color: sticker.color }}
                >
                  <Icon size={28} />
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(a.id)}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )
```
to:
```typescript
              const c = a.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              const style = { left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px` }
              const deleteButton = (
                <button
                  type="button"
                  onClick={() => handleDeleteAnnotation(a.id)}
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                  title="Delete"
                >
                  ×
                </button>
              )
              if (c.kind === 'sticker_custom') {
                const url = customStickerUrls[c.storagePath]
                return (
                  <div key={a.id} className="group absolute" style={style}>
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="Sticker" className="h-full w-full object-contain" />
                    )}
                    {deleteButton}
                  </div>
                )
              }
              const sticker = findBuiltinSticker(c.id)
              if (!sticker) return null
              const Icon = sticker.icon
              return (
                <div key={a.id} className="group absolute flex items-center justify-center" style={{ ...style, color: sticker.color }}>
                  <Icon size={28} />
                  {deleteButton}
                </div>
              )
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Manual smoke test**

In an open worksheet, click the upload icon in the sticker palette, choose a JPEG, click the page
to place it. Confirm it renders. Reload the modal and confirm the custom sticker still renders
(signed URL re-fetched on load).

- [ ] **Step 5: Commit**

```bash
git add src/components/worksheets/StickerPalette.tsx src/components/worksheets/WorksheetAnnotator.tsx
git commit -m "feat: worksheet annotation — custom sticker upload"
```

---

### Task 6: In-call integration

**Files:**
- Modify: `src/components/video/CallPanel.tsx`
- Create: `src/components/video/WorksheetTab.tsx`
- Modify: `src/components/video/CallRoom.tsx`
- Modify: `src/app/dashboard/video/[roomId]/page.tsx`
- Modify: `src/components/video/GuestJoinClient.tsx`
- Modify: `src/app/join/[guestToken]/page.tsx`

**Interfaces:**
- Consumes: `WorksheetAnnotator` (Task 3) and `createTopicAssetSignedUrl` (existing,
  `src/lib/tutoring/topic-storage.ts`).
- Produces: no new exports consumed elsewhere — this is the final integration task.

**Design note on the guest (student) side:** this codebase has two separate call-join paths — an
authenticated org-member path (`/dashboard/video/[roomId]`) and a guest-invite path
(`/join/[guestToken]` → `GuestJoinClient.tsx`) for clients/students without a TimeWiseHub account.
Today, guests already don't receive the in-call Program reference panel either (only video + chat
when available) — so there is no existing "guest resolves their own linked content" pattern to
reuse. Rather than building one (which would need an unauthenticated-safe access check), the
tutor's worksheet **selection is broadcast** over a call-scoped channel; the guest's screen
auto-opens whatever the tutor opens, using the guest's own existing chat identity
(`sessionChat.userId`, already established via `verifyOtp`) to place objects. The guest never gets
their own worksheet picker — only the org-member side does.

- [ ] **Step 1: Add the tab type to `CallPanel.tsx`**

Change:
```typescript
export type CallPanelTabId = 'transcript' | 'program' | 'chat'

const TAB_LABEL: Record<CallPanelTabId, string> = {
  transcript: 'Transcript',
  program: 'Program',
  chat: 'Chat',
}
```
to:
```typescript
export type CallPanelTabId = 'transcript' | 'program' | 'chat' | 'worksheet'

const TAB_LABEL: Record<CallPanelTabId, string> = {
  transcript: 'Transcript',
  program: 'Program',
  chat: 'Chat',
  worksheet: 'Worksheet',
}
```

- [ ] **Step 2: Write `src/components/video/WorksheetTab.tsx`**

One component serves both roles: the org-member side has `assets` to pick from and broadcasts its
selection; the guest side always has an empty `assets` list and only ever receives a selection.
Both sides render the same `WorksheetAnnotator` once a selection exists (their own, or a received
one).

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import WorksheetAnnotator from '@/components/worksheets/WorksheetAnnotator'

export type LinkedTopicAsset = { id: string; name: string; asset_type: 'pdf' | 'image'; signed_url: string }

type Selection = { asset: LinkedTopicAsset; studentId: string }

export function callWorksheetChannelName(callId: string): string {
  return `call-worksheet:${callId}`
}

export default function WorksheetTab({
  callId,
  assets,
  studentId,
  currentUserId,
  canPick,
}: {
  callId: string
  assets: LinkedTopicAsset[]
  studentId: string | null
  currentUserId: string
  canPick: boolean
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(callWorksheetChannelName(callId))
    channel
      .on('broadcast', { event: 'select' }, ({ payload }) => {
        setSelected(payload as Selection)
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [callId])

  function pick(asset: LinkedTopicAsset) {
    if (!studentId) return
    const selection: Selection = { asset, studentId }
    channelRef.current?.send({ type: 'broadcast', event: 'select', payload: selection })
    setSelected(selection)
  }

  if (selected) {
    return (
      <WorksheetAnnotator
        topicAssetId={selected.asset.id}
        studentId={selected.studentId}
        fileUrl={selected.asset.signed_url}
        assetType={selected.asset.asset_type}
        currentUserId={currentUserId}
      />
    )
  }

  if (!canPick) {
    return <p className="p-3 text-xs text-slate-500">Waiting for the tutor to open a worksheet…</p>
  }

  if (!studentId) {
    return <p className="p-3 text-xs text-slate-500">This session has no student assigned — worksheets need a student to attach to.</p>
  }

  if (assets.length === 0) {
    return <p className="p-3 text-xs text-slate-500">No worksheet PDFs or images uploaded for this topic yet.</p>
  }

  return (
    <div className="space-y-1 p-2">
      {assets.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => pick(a)}
          className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
        >
          {a.name}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Wire into `CallRoom.tsx`**

Change the `Props` type from:
```typescript
type Props = {
  roomUrl: string
  token: string
  dailyRoomName: string
  isCreator: boolean
  isGuest?: boolean
  callId?: string
  linkedProgram?: LinkedProgramBundle | null
  sessionChat?: { conversationId: string; userId: string } | null
}
```
to:
```typescript
type Props = {
  roomUrl: string
  token: string
  dailyRoomName: string
  isCreator: boolean
  isGuest?: boolean
  callId?: string
  linkedProgram?: LinkedProgramBundle | null
  sessionChat?: { conversationId: string; userId: string } | null
  linkedTopicAssets?: LinkedTopicAsset[]
  sessionStudentId?: string | null
  currentUserId?: string
}
```

`currentUserId` is optional because the guest path (`GuestJoinClient.tsx`, this same task) only
knows it once `sessionChat` resolves via `verifyOtp` — before that, a guest has no identity to
gate worksheet access on, same precondition the existing Chat tab already has.

Add the import at the top:
```typescript
import WorksheetTab, { type LinkedTopicAsset } from './WorksheetTab'
```

Change the component signature from:
```typescript
export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, isGuest = false, callId, linkedProgram, sessionChat }: Props) {
```
to:
```typescript
export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, isGuest = false, callId, linkedProgram, sessionChat, linkedTopicAssets, sessionStudentId, currentUserId }: Props) {
```

Change `availableTabs` from:
```typescript
  const availableTabs: CallPanelTabId[] = [
    'transcript',
    ...(linkedProgram ? (['program'] as const) : []),
    ...(sessionChat ? (['chat'] as const) : []),
  ]
```
to:
```typescript
  const canUseWorksheet = !!callId && !!currentUserId && ((linkedTopicAssets && linkedTopicAssets.length > 0) || isGuest)

  const availableTabs: CallPanelTabId[] = [
    'transcript',
    ...(linkedProgram ? (['program'] as const) : []),
    ...(sessionChat ? (['chat'] as const) : []),
    ...(canUseWorksheet ? (['worksheet'] as const) : []),
  ]
```

(a guest is offered the tab whenever they have an identity, even with an empty `linkedTopicAssets`,
since they're only ever following the tutor's selection — see `WorksheetTab`'s own empty-state
message for that case)

Add a Worksheet tab body inside the existing `<CallPanel>` children, alongside the existing
`activeTab === 'chat'` block:
```typescript
        {activeTab === 'worksheet' && canUseWorksheet && (
          <WorksheetTab
            callId={callId!}
            assets={linkedTopicAssets ?? []}
            studentId={sessionStudentId ?? null}
            currentUserId={currentUserId!}
            canPick={!isGuest}
          />
        )}
```

Add a Worksheet button in the controls bar, alongside the existing Program button, gated by the
same `canUseWorksheet` flag:
```typescript
        {canUseWorksheet && (
          <button
            onClick={() => openTab('worksheet')}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
            title="Toggle worksheet panel"
          >
            <NotebookPen size={15} />
            Worksheet
          </button>
        )}
```

- [ ] **Step 4: Fetch linked topic assets in the video room page**

In `src/app/dashboard/video/[roomId]/page.tsx`, add the import:
```typescript
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import type { LinkedTopicAsset } from '@/components/video/WorksheetTab'
```

Add a new function alongside `fetchLinkedProgram`:
```typescript
async function fetchLinkedTopicAssets(sessionId: string, userId: string): Promise<{ assets: LinkedTopicAsset[]; studentId: string | null }> {
  const service = createServiceClient()

  const { data: session } = await service
    .from('sessions').select('topic_id, student_id').eq('id', sessionId).maybeSingle()
  if (!session?.topic_id) return { assets: [], studentId: session?.student_id ?? null }

  const { data: topic } = await service
    .from('topics').select('subject_id').eq('id', session.topic_id).maybeSingle()
  if (!topic) return { assets: [], studentId: session.student_id }

  const { data: subject } = await service
    .from('subjects').select('org_id, created_by').eq('id', topic.subject_id).maybeSingle()
  if (!subject) return { assets: [], studentId: session.student_id }

  if (subject.org_id) {
    const { data: membership } = await service
      .from('organisation_members').select('role').eq('user_id', userId).eq('org_id', subject.org_id).maybeSingle()
    if (!membership) return { assets: [], studentId: session.student_id }
  } else if (subject.created_by !== userId) {
    return { assets: [], studentId: session.student_id }
  }

  const { data: assets } = await service
    .from('topic_assets')
    .select('id, name, asset_type, storage_path')
    .eq('topic_id', session.topic_id)
    .in('asset_type', ['pdf', 'image'])

  const withUrls: LinkedTopicAsset[] = await Promise.all(
    (assets ?? []).map(async a => ({
      id: a.id,
      name: a.name,
      asset_type: a.asset_type as 'pdf' | 'image',
      signed_url: (a.storage_path ? await createTopicAssetSignedUrl(a.storage_path) : null) ?? '',
    })),
  )

  return { assets: withUrls.filter(a => a.signed_url), studentId: session.student_id }
}
```

Change the `linkedProgram` line and the `CallRoom` render. From:
```typescript
  const linkedProgram = call.session_id ? await fetchLinkedProgram(call.session_id, user.id) : null
  const sessionChat = call.session_id
    ? { conversationId: await ensureSessionChatParticipant(call.session_id, user.id), userId: user.id }
    : null
```
to:
```typescript
  const linkedProgram = call.session_id ? await fetchLinkedProgram(call.session_id, user.id) : null
  const sessionChat = call.session_id
    ? { conversationId: await ensureSessionChatParticipant(call.session_id, user.id), userId: user.id }
    : null
  const { assets: linkedTopicAssets, studentId: sessionStudentId } = call.session_id
    ? await fetchLinkedTopicAssets(call.session_id, user.id)
    : { assets: [], studentId: null }
```

And from:
```typescript
    <CallRoom
      roomUrl={call.room_url}
      token={token!}
      dailyRoomName={call.daily_room_name}
      isCreator={call.created_by === user.id}
      callId={roomId}
      linkedProgram={linkedProgram}
      sessionChat={sessionChat}
    />
```
to:
```typescript
    <CallRoom
      roomUrl={call.room_url}
      token={token!}
      dailyRoomName={call.daily_room_name}
      isCreator={call.created_by === user.id}
      callId={roomId}
      linkedProgram={linkedProgram}
      sessionChat={sessionChat}
      linkedTopicAssets={linkedTopicAssets}
      sessionStudentId={sessionStudentId}
      currentUserId={user.id}
    />
```

- [ ] **Step 5: Thread `callId` and a guest identity through the guest-join path**

In `src/app/join/[guestToken]/page.tsx`, add `id` to the existing `scheduled_calls` select — change:
```typescript
    .select('id, display_name, scheduled_calls(id, title, starts_at, daily_room_name, room_url)')
```
(no change needed — `id` on `scheduled_calls` is already selected; only the destructured `call`
type below needs it). Change:
```typescript
  const call = (invitee?.scheduled_calls as unknown as {
    id: string
    title: string
    starts_at: string | null
    daily_room_name: string
    room_url: string
  } | null)
```
(no change needed — `id` is already in this type). Change the `<GuestJoinClient>` render from:
```typescript
    <GuestJoinClient
      callTitle={call.title}
      roomUrl={call.room_url}
      dailyRoomName={call.daily_room_name}
      guestToken={guestToken}
      defaultName={invitee?.display_name ?? ''}
    />
```
to:
```typescript
    <GuestJoinClient
      callId={call.id}
      callTitle={call.title}
      roomUrl={call.room_url}
      dailyRoomName={call.daily_room_name}
      guestToken={guestToken}
      defaultName={invitee?.display_name ?? ''}
    />
```

In `src/components/video/GuestJoinClient.tsx`, add `callId` to `Props` — change:
```typescript
type Props = {
  callTitle: string
  roomUrl: string
  dailyRoomName: string
  guestToken: string
  defaultName: string
}
```
to:
```typescript
type Props = {
  callId: string
  callTitle: string
  roomUrl: string
  dailyRoomName: string
  guestToken: string
  defaultName: string
}
```

Change the function signature from:
```typescript
export default function GuestJoinClient({ callTitle, roomUrl, dailyRoomName, guestToken, defaultName }: Props) {
```
to:
```typescript
export default function GuestJoinClient({ callId, callTitle, roomUrl, dailyRoomName, guestToken, defaultName }: Props) {
```

Change the `<CallRoom>` render from:
```typescript
      <CallRoom
        roomUrl={roomUrl}
        token={token}
        dailyRoomName={dailyRoomName}
        isCreator={false}
        isGuest
        sessionChat={sessionChat}
      />
```
to:
```typescript
      <CallRoom
        roomUrl={roomUrl}
        token={token}
        dailyRoomName={dailyRoomName}
        isCreator={false}
        isGuest
        callId={callId}
        sessionChat={sessionChat}
        currentUserId={sessionChat?.userId}
      />
```

`linkedTopicAssets` is deliberately left unset for the guest — per this task's design note, a
guest only ever follows the tutor's broadcast selection, never picks their own.

- [ ] **Step 6: Build**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 7: Manual smoke test**

Start (or schedule) a call on a session that has a `topic_id` set with an uploaded PDF/image and a
`student_id` set. Join as the org member, open the new "Worksheet" tab, pick the worksheet, confirm
it renders. Separately, join the same call via its guest invite link (a second browser/incognito
window) with a client that has an email on file (so `sessionChat` resolves) — confirm the guest
sees a "Waiting for the tutor to open a worksheet…" message in their own Worksheet tab, then
confirm the same worksheet automatically appears for the guest once the tutor has it open. Confirm
a text box typed in one appears live in the other, and a placed sticker/stroke appears live too, in
both directions. Leave the call, reopen the same worksheet via `/dashboard/subjects`'s Annotate
action for the same student, and confirm everything persisted. Separately, confirm a guest with *no*
email on file (no `sessionChat`) does not see a Worksheet tab at all, matching the existing Chat
tab's own precondition.

- [ ] **Step 8: Commit**

```bash
git add src/components/video/CallPanel.tsx src/components/video/WorksheetTab.tsx src/components/video/CallRoom.tsx "src/app/dashboard/video/[roomId]/page.tsx" src/components/video/GuestJoinClient.tsx "src/app/join/[guestToken]/page.tsx"
git commit -m "feat: worksheet annotation — in-call worksheet tab, tutor + guest"
```

---

## Acceptance checklist

- [ ] Task 1: `worksheet_annotations` table, `can_edit_worksheet()` function, `worksheet-stickers`
  bucket, and all RLS/storage policies applied and verified.
- [ ] Task 2: `react-pdf`/`perfect-freehand` installed, worker self-hosted, shared types/lib
  helpers compile.
- [ ] Task 3: Core annotator renders a PDF/image and supports text/stroke/builtin-sticker
  placement with live broadcast + debounced persistence.
- [ ] Task 4: Async entry point from `/dashboard/subjects` works end to end, confirmed via manual
  smoke including the cross-student isolation check.
- [ ] Task 5: Custom JPEG sticker upload works and persists/reloads correctly.
- [ ] Task 6: In-call Worksheet tab works for the org-member/tutor side; the guest (student) side
  auto-follows the tutor's selection via broadcast and can co-edit using their existing chat
  identity; confirmed live between two simultaneous participants (tutor + guest), and the same
  data is reachable afterward from the async entry point.

## Verification

`pnpm run build` must pass clean after every task — no test runner in this project. Manual browser
smoke (ideally two simultaneous sessions/accounts for the live-sync checks) is required for Tasks
3 through 6, per this project's established convention that shipped-feature bugs have repeatedly
only surfaced through real manual testing, not the build alone.
