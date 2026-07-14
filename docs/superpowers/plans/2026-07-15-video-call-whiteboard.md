# Video Call Whiteboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This project uses the handover loop instead** (Claude = conductor, Codex = implementer via `.handover/`). After this plan is written and self-reviewed, it is translated into `.handover/spec.md` as a C-N checklist and executed via the `handover-loop` skill — do not invoke subagent-driven-development or executing-plans here.

**Goal:** Add a freeform collaborative whiteboard to tutoring video calls — a session-scoped blank canvas with pen (colours + thickness), true drag-to-erase, text boxes, and stickers, gated to Pro/Team plans but always visible.

**Architecture:** A new `whiteboard_objects` table (discrete text_box/stroke/sticker rows, scoped by `session_id`) reuses the exact Broadcast-for-live/table-for-persistence sync pattern already proven by Worksheet Annotation. A new `WhiteboardCanvas` component follows `WorksheetAnnotator`'s structure but drops the PDF/image/page machinery in favour of a fixed blank canvas, and adds the one genuinely new piece: drag-to-erase, which splits a stroke's points into surviving contiguous runs and replaces the original row with zero, one, or several new rows. Two existing components (`StickerPalette`, `WorksheetFullScreen`) get small, backward-compatible generalizations so both features can share them.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Realtime Broadcast, Storage, RLS), `perfect-freehand` (already installed, no new dependency).

## Global Constraints
- No new npm dependencies — `perfect-freehand` is already installed; no `react-pdf` needed (no document to render).
- No test runner — verification is `pnpm run build` (tsc + eslint) plus manual smoke testing.
- Migration committed as `supabase/schema-103-whiteboard.sql`, applied via Supabase MCP `apply_migration` by the conductor — Codex cannot do this.
- Tutoring only — not gated to a workspace profile check anywhere in code (matches Worksheet Annotation's own precedent of no explicit profile gate), but only reachable from a tutoring session's call since that's the only place `session_id` is meaningful.
- Plan gating (Pro/Team only, visible but locked on Free) is enforced at the UI layer only, not RLS — documented, deliberate limitation matching the account-deactivation gate's own precedent.

---

### Task 1: Database schema (conductor-only — not dispatched to Codex)

**Files:**
- Create: `supabase/schema-103-whiteboard.sql`

**Interfaces:**
- Produces: table `whiteboard_objects` (`id, session_id, object_type, x, y, width, height, content, created_by, created_at, updated_at`), function `can_edit_whiteboard(p_session_id uuid) returns boolean`, storage bucket `whiteboard-stickers`. Every later task reads/writes these by name.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 103: Video call whiteboard
-- Freeform collaborative drawing scoped to a tutoring session,
-- live or reopened later. Run via Supabase MCP apply_migration
-- (name: whiteboard)
-- ============================================================

create type public.whiteboard_object_type as enum ('text_box', 'stroke', 'sticker');

create table public.whiteboard_objects (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions on delete cascade,
  object_type  public.whiteboard_object_type not null,
  x            numeric(6,5) not null,
  y            numeric(6,5) not null,
  width        numeric(6,5) not null,
  height       numeric(6,5) not null,
  content      jsonb not null,
  created_by   uuid not null references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index whiteboard_objects_scope
  on public.whiteboard_objects (session_id, created_at);

alter table public.whiteboard_objects enable row level security;

-- Resolves access via sessions' own org_id/created_by directly (sessions
-- already carries these, so no topics/subjects hop is needed, unlike
-- can_edit_worksheet), OR via the guest identity tied to the session's
-- client. Mirrors can_edit_worksheet's shape
-- (schema-092-worksheet-annotations.sql) applied to a simpler table.
create or replace function public.can_edit_whiteboard(p_session_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_org_id uuid;
  v_created_by uuid;
  v_client_id uuid;
  v_guest_user_id uuid;
begin
  select org_id, created_by, client_id into v_org_id, v_created_by, v_client_id
  from public.sessions where id = p_session_id;

  if v_created_by is null then
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
    if v_created_by = auth.uid() then
      return true;
    end if;
  end if;

  select guest_chat_user_id into v_guest_user_id from public.clients where id = v_client_id;
  if v_guest_user_id is not null and v_guest_user_id = auth.uid() then
    return true;
  end if;

  return false;
end;
$$;

create policy "Can view whiteboard objects" on public.whiteboard_objects for select
  using (public.can_edit_whiteboard(session_id));

create policy "Can manage whiteboard objects" on public.whiteboard_objects for all
  using (public.can_edit_whiteboard(session_id))
  with check (public.can_edit_whiteboard(session_id));

-- Storage bucket for ad hoc uploaded stickers. Path convention:
-- {sessionId}/{filename} — lets a storage policy resolve access via
-- can_edit_whiteboard() using the first path segment.
insert into storage.buckets (id, name, public) values ('whiteboard-stickers', 'whiteboard-stickers', false);

create policy "whiteboard-stickers: read with access" on storage.objects for select
  using (
    bucket_id = 'whiteboard-stickers'
    and public.can_edit_whiteboard((storage.foldername(name))[1]::uuid)
  );

create policy "whiteboard-stickers: upload with access" on storage.objects for insert
  with check (
    bucket_id = 'whiteboard-stickers'
    and public.can_edit_whiteboard((storage.foldername(name))[1]::uuid)
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Run (conductor, via `mcp__supabase__apply_migration`, project id `sdwwlnnsijcadkdwsvud`): apply the SQL above with migration name `whiteboard`.

- [ ] **Step 3: Verify**

Run (via `mcp__supabase__execute_sql`): `select policyname from pg_policies where tablename = 'whiteboard_objects';` — expect 2 rows. `select policyname from pg_policies where tablename = 'objects' and policyname like 'whiteboard-stickers%';` — expect 2 rows. `select proname from pg_proc where proname = 'can_edit_whiteboard';` — expect 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-103-whiteboard.sql
git commit -m "schema: add whiteboard_objects table, can_edit_whiteboard(), whiteboard-stickers bucket"
```

---

### Task 2: Types

**Files:**
- Create: `src/types/whiteboard.ts`

**Interfaces:**
- Produces: `WhiteboardObjectType`, `WhiteboardObjectContent` (union), `WhiteboardObject`, `NewWhiteboardObject`. Task 3 and Task 5 both import from here.

- [ ] **Step 1: Write the types file**

```ts
// src/types/whiteboard.ts
export type WhiteboardObjectType = 'text_box' | 'stroke' | 'sticker'

export type WhiteboardTextBoxContent = { kind: 'text_box'; text: string }
export type WhiteboardStrokeContent = { kind: 'stroke'; points: [number, number][]; color: string; strokeWidth: number }
export type WhiteboardStickerContent =
  | { kind: 'sticker_builtin'; id: string }
  | { kind: 'sticker_custom'; storagePath: string }

export type WhiteboardObjectContent = WhiteboardTextBoxContent | WhiteboardStrokeContent | WhiteboardStickerContent

export type WhiteboardObject = {
  id: string
  session_id: string
  object_type: WhiteboardObjectType
  x: number
  y: number
  width: number
  height: number
  content: WhiteboardObjectContent
  created_by: string
  created_at: string
  updated_at: string
}

export type NewWhiteboardObject = Omit<WhiteboardObject, 'id' | 'created_at' | 'updated_at'>
```

- [ ] **Step 2: Verify**

Run: `pnpm run build` — expect a clean pass.

- [ ] **Step 3: Commit**

```bash
git add src/types/whiteboard.ts
git commit -m "feat: add whiteboard object types"
```

---

### Task 3: Data access lib

**Files:**
- Create: `src/lib/whiteboard/objects.ts`

**Interfaces:**
- Consumes: `WhiteboardObject`, `NewWhiteboardObject`, `WhiteboardObjectContent` from Task 2.
- Produces: `whiteboardChannelName(sessionId)`, `fetchWhiteboardObjects(sessionId)`, `insertWhiteboardObject(row)`, `updateWhiteboardObjectContent(id, content)`, `updateWhiteboardObjectPosition(id, position)`, `updateWhiteboardObjectStroke(id, patch)`, `deleteWhiteboardObject(id)`. Task 5 (`WhiteboardCanvas`) calls all of these.

- [ ] **Step 1: Write the lib file**

```ts
// src/lib/whiteboard/objects.ts
import { createClient } from '@/lib/supabase-browser'
import type { WhiteboardObjectContent, NewWhiteboardObject, WhiteboardObject } from '@/types/whiteboard'

export function whiteboardChannelName(sessionId: string): string {
  return `whiteboard:${sessionId}`
}

export async function fetchWhiteboardObjects(sessionId: string): Promise<WhiteboardObject[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whiteboard_objects')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as WhiteboardObject[]
}

export async function insertWhiteboardObject(row: NewWhiteboardObject): Promise<WhiteboardObject> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whiteboard_objects')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as WhiteboardObject
}

export async function updateWhiteboardObjectContent(id: string, content: WhiteboardObjectContent): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateWhiteboardObjectPosition(
  id: string,
  position: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ ...position, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Erasing a stroke down to one surviving run needs both new points (content)
// and a new tight bounding box (position) written atomically in one request
// — the two separate functions above would otherwise be two round trips for
// what's conceptually a single update.
export async function updateWhiteboardObjectStroke(
  id: string,
  patch: { x: number; y: number; width: number; height: number; content: WhiteboardObjectContent },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWhiteboardObject(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('whiteboard_objects').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Verify**

Run: `pnpm run build` — expect a clean pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whiteboard/objects.ts
git commit -m "feat: add whiteboard data access functions"
```

---

### Task 4: Generalize StickerPalette and WorksheetFullScreen

**Files:**
- Modify: `src/components/worksheets/StickerPalette.tsx`
- Modify: `src/components/worksheets/WorksheetAnnotator.tsx` (its one call site)
- Modify: `src/components/video/WorksheetFullScreen.tsx`
- Modify: `src/components/video/CallRoom.tsx` (its two existing call sites)

**Interfaces:**
- Produces: `<StickerPalette bucket={string} buildUploadPath={(file: File) => string} onPick={...} onUploadCustom={...} />` (replaces the old `topicAssetId`/`studentId` props). `<WorksheetFullScreen title={string} onClose={...}>` (adds a required `title` prop, replacing the hardcoded "Worksheet" label). Task 5's `WhiteboardCanvas` will pass its own `bucket="whiteboard-stickers"`/`buildUploadPath` to `StickerPalette`; Task 7 will pass `title="Whiteboard"` to a new `WorksheetFullScreen` call site.

This is a pure refactor — worksheets must behave identically after this task. No new behavior yet.

- [ ] **Step 1: Generalize `StickerPalette.tsx`**

Replace the whole file:

```tsx
// src/components/worksheets/StickerPalette.tsx
'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { BUILTIN_STICKERS } from '@/lib/worksheets/stickers'
import { createClient } from '@/lib/supabase-browser'

export default function StickerPalette({
  bucket,
  buildUploadPath,
  onPick,
  onUploadCustom,
}: {
  bucket: string
  buildUploadPath: (file: File) => string
  onPick: (stickerId: string) => void
  onUploadCustom: (storagePath: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const storagePath = buildUploadPath(file)
    const supabase = createClient()
    const { error } = await supabase.storage.from(bucket).upload(storagePath, file)
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

- [ ] **Step 2: Update `WorksheetAnnotator.tsx`'s call site**

Read the file first. Find:

```tsx
        <StickerPalette
          topicAssetId={topicAssetId}
          studentId={studentId}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />
```

Replace with:

```tsx
        <StickerPalette
          bucket="worksheet-stickers"
          buildUploadPath={file => `${topicAssetId}/${studentId}/${crypto.randomUUID()}-${file.name}`}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />
```

This produces the exact same storage path as before (`${topicAssetId}/${studentId}/${crypto.randomUUID()}-${file.name}`) — no behavior change.

- [ ] **Step 3: Generalize `WorksheetFullScreen.tsx`**

Replace the whole file:

```tsx
// src/components/video/WorksheetFullScreen.tsx
'use client'

import { X } from 'lucide-react'

export default function WorksheetFullScreen({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <span className="text-sm font-bold text-white">{title}</span>
          <p className="truncate text-xs text-slate-400">
            Tip: click Daily&apos;s Picture-in-Picture button first if you want to keep seeing each other while you work here.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Update `CallRoom.tsx`'s two existing call sites**

Read the file first. Find:

```tsx
      {worksheetFullScreen && canUseWorksheet && (
        <WorksheetFullScreen onClose={() => setWorksheetFullScreen(false)}>
```

Replace with:

```tsx
      {worksheetFullScreen && canUseWorksheet && (
        <WorksheetFullScreen title="Worksheet" onClose={() => setWorksheetFullScreen(false)}>
```

Find:

```tsx
      {programAnnotateAsset && (
        <WorksheetFullScreen onClose={() => setProgramAnnotateAsset(null)}>
```

Replace with:

```tsx
      {programAnnotateAsset && (
        <WorksheetFullScreen title="Worksheet" onClose={() => setProgramAnnotateAsset(null)}>
```

Do not touch anything else in this file this task — the new Whiteboard button and its own `WorksheetFullScreen` call site are Task 7.

- [ ] **Step 5: Verify**

Run: `pnpm run build` — must pass clean (this is where a missed `title` prop or a mismatched `StickerPalette` prop would surface as a type error).

Manual: open an existing worksheet (either via a call's Worksheet button or `/dashboard/subjects`'s Annotate action), confirm it still says "Worksheet" in the full-screen header, confirm uploading a custom sticker still works and still lands in the `worksheet-stickers` bucket at the same path shape as before.

- [ ] **Step 6: Commit**

```bash
git add src/components/worksheets/StickerPalette.tsx src/components/worksheets/WorksheetAnnotator.tsx src/components/video/WorksheetFullScreen.tsx src/components/video/CallRoom.tsx
git commit -m "refactor: generalize StickerPalette and WorksheetFullScreen for reuse by the whiteboard"
```

---

### Task 5: WhiteboardCanvas component

**Files:**
- Create: `src/components/whiteboard/WhiteboardCanvas.tsx`

**Interfaces:**
- Consumes: everything from Task 2 (types) and Task 3 (lib), the generalized `StickerPalette` from Task 4, `BUILTIN_STICKERS`/`findBuiltinSticker` from `src/lib/worksheets/stickers.ts` (unchanged, reused as-is).
- Produces: `<WhiteboardCanvas sessionId={string} currentUserId={string} />`. Task 7 renders this inside `WorksheetFullScreen` when `whiteboardAllowed` is true.

This is the largest task in the plan — the eraser is the one genuinely new algorithm, everything else follows `WorksheetAnnotator.tsx`'s proven shape.

- [ ] **Step 1: Write the component**

```tsx
// src/components/whiteboard/WhiteboardCanvas.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { Type, Pencil, Eraser, Move } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchWhiteboardObjects,
  insertWhiteboardObject,
  updateWhiteboardObjectContent,
  updateWhiteboardObjectPosition,
  updateWhiteboardObjectStroke,
  deleteWhiteboardObject,
  whiteboardChannelName,
} from '@/lib/whiteboard/objects'
import { findBuiltinSticker } from '@/lib/worksheets/stickers'
import StickerPalette from '@/components/worksheets/StickerPalette'
import ScrollFade from '@/components/ui/ScrollFade'
import type { WhiteboardObject, WhiteboardObjectContent, WhiteboardStrokeContent } from '@/types/whiteboard'

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 600
const ERASER_RADIUS = 14

const PEN_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
const PEN_WIDTHS = [2, 4, 7] as const

type Tool = 'pen' | 'eraser' | 'text' | 'sticker' | null

function strokeToPath(points: [number, number][], width: number): string {
  const outline = getStroke(points, { size: width })
  if (outline.length === 0) return ''
  return outline.reduce((acc, [x, y], i) => `${acc}${i === 0 ? 'M' : 'L'}${x},${y} `, '') + 'Z'
}

// Walks `points` in original order, dropping any index in `erased`, and
// returns each contiguous surviving run with >=2 points (a single leftover
// point isn't a visible stroke, so it's not worth keeping).
function contiguousSurvivingRuns(points: [number, number][], erased: Set<number>): [number, number][][] {
  const runs: [number, number][][] = []
  let current: [number, number][] = []
  points.forEach((p, i) => {
    if (erased.has(i)) {
      if (current.length >= 2) runs.push(current)
      current = []
    } else {
      current.push(p)
    }
  })
  if (current.length >= 2) runs.push(current)
  return runs
}

// Converts a run of points expressed in `original`'s own local space (0-1
// within original's own x/y/width/height) into a fresh, tightly-normalized
// stroke — the same min/max-based normalization a freshly-drawn stroke gets.
function runToNewStroke(
  run: [number, number][],
  original: WhiteboardObject,
): { x: number; y: number; width: number; height: number; content: WhiteboardStrokeContent } {
  const c = original.content as WhiteboardStrokeContent
  const canvasFractionPoints: [number, number][] = run.map(([lx, ly]) => [
    original.x + lx * original.width,
    original.y + ly * original.height,
  ])
  const xs = canvasFractionPoints.map(p => p[0])
  const ys = canvasFractionPoints.map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const maxX = Math.max(...xs), maxY = Math.max(...ys)
  const normalised: [number, number][] = canvasFractionPoints.map(([x, y]) => [x - minX, y - minY])
  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 0.01),
    height: Math.max(maxY - minY, 0.01),
    content: { kind: 'stroke', points: normalised, color: c.color, strokeWidth: c.strokeWidth },
  }
}

export default function WhiteboardCanvas({
  sessionId,
  currentUserId,
}: {
  sessionId: string
  currentUserId: string
}) {
  const [objects, setObjects] = useState<WhiteboardObject[]>([])
  const [customStickerUrls, setCustomStickerUrls] = useState<Record<string, string>>({})
  const [tool, setTool] = useState<Tool>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState<typeof PEN_WIDTHS[number]>(PEN_WIDTHS[1])
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([])
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null)
  const [eraserTick, setEraserTick] = useState(0)
  const canvasRef = useRef<HTMLDivElement>(null)
  const textDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const erasedPointIndicesRef = useRef<Map<string, Set<number>>>(new Map())

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWhiteboardObjects(sessionId).then(rows => {
      if (!cancelled) setObjects(rows)
    })
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    const customPaths = objects
      .filter(o => o.object_type === 'sticker' && (o.content as { kind: string }).kind === 'sticker_custom')
      .map(o => (o.content as { kind: 'sticker_custom'; storagePath: string }).storagePath)
      .filter(p => !customStickerUrls[p])
    if (customPaths.length === 0) return
    const supabase = createClient()
    Promise.all(customPaths.map(p => supabase.storage.from('whiteboard-stickers').createSignedUrl(p, 3600)))
      .then(results => {
        setCustomStickerUrls(prev => {
          const next = { ...prev }
          results.forEach((r, i) => { if (r.data) next[customPaths[i]] = r.data.signedUrl })
          return next
        })
      })
  }, [objects, customStickerUrls])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(whiteboardChannelName(sessionId))
    channel
      .on('broadcast', { event: 'upsert' }, ({ payload }) => {
        const row = payload as WhiteboardObject
        setObjects(prev => {
          const idx = prev.findIndex(o => o.id === row.id)
          if (idx === -1) return [...prev, row]
          const next = [...prev]
          next[idx] = row
          return next
        })
      })
      .on('broadcast', { event: 'delete' }, ({ payload }) => {
        const { id } = payload as { id: string }
        setObjects(prev => prev.filter(o => o.id !== id))
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  function broadcastUpsert(row: WhiteboardObject) {
    channelRef.current?.send({ type: 'broadcast', event: 'upsert', payload: row })
  }

  function broadcastDelete(id: string) {
    channelRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
  }

  async function handleDeleteObject(id: string) {
    setObjects(prev => prev.filter(o => o.id !== id))
    if (selectedId === id) setSelectedId(null)
    broadcastDelete(id)
    await deleteWhiteboardObject(id)
  }

  function relativePosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null)
  const [pendingCustomSticker, setPendingCustomSticker] = useState<string | null>(null)

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'text' && tool !== 'sticker') {
      setSelectedId(null)
      return
    }
    const { x, y } = relativePosition(e.clientX, e.clientY)

    const content: WhiteboardObjectContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : pendingCustomSticker
        ? { kind: 'sticker_custom', storagePath: pendingCustomSticker }
        : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }

    const saved = await insertWhiteboardObject({
      session_id: sessionId,
      object_type: tool === 'text' ? 'text_box' : 'sticker',
      x, y, width: tool === 'text' ? 0.2 : 0.06, height: tool === 'text' ? 0.05 : 0.06,
      content,
      created_by: currentUserId,
    })
    setObjects(prev => [...prev, saved])
    broadcastUpsert(saved)
    if (tool === 'text') setSelectedId(saved.id)
    setTool(null)
    setPendingStickerId(null)
    setPendingCustomSticker(null)
  }

  function handleEraserMove(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH
    const py = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    setEraserPos({ x: px, y: py })

    let changed = false
    for (const o of objects) {
      if (o.object_type !== 'stroke') continue
      const c = o.content as WhiteboardStrokeContent
      const erasedForThis = erasedPointIndicesRef.current.get(o.id) ?? new Set<number>()
      let localChanged = false
      c.points.forEach(([lx, ly], i) => {
        if (erasedForThis.has(i)) return
        const absX = (o.x + lx * o.width) * CANVAS_WIDTH
        const absY = (o.y + ly * o.height) * CANVAS_HEIGHT
        const dx = absX - px, dy = absY - py
        if (dx * dx + dy * dy <= ERASER_RADIUS * ERASER_RADIUS) {
          erasedForThis.add(i)
          localChanged = true
        }
      })
      if (localChanged) {
        erasedPointIndicesRef.current.set(o.id, erasedForThis)
        changed = true
      }
    }
    if (changed) setEraserTick(t => t + 1)
  }

  async function completeErase() {
    const touched = Array.from(erasedPointIndicesRef.current.entries())
    erasedPointIndicesRef.current = new Map()
    setEraserTick(t => t + 1)
    setEraserPos(null)

    for (const [strokeId, erasedIndices] of touched) {
      const original = objects.find(o => o.id === strokeId)
      if (!original || original.object_type !== 'stroke') continue
      const c = original.content as WhiteboardStrokeContent
      const runs = contiguousSurvivingRuns(c.points, erasedIndices)

      if (runs.length === 0) {
        setObjects(prev => prev.filter(o => o.id !== strokeId))
        broadcastDelete(strokeId)
        await deleteWhiteboardObject(strokeId)
        continue
      }

      if (runs.length === 1) {
        const { x, y, width, height, content } = runToNewStroke(runs[0], original)
        const updated: WhiteboardObject = { ...original, x, y, width, height, content }
        setObjects(prev => prev.map(o => (o.id === strokeId ? updated : o)))
        broadcastUpsert(updated)
        await updateWhiteboardObjectStroke(strokeId, { x, y, width, height, content })
        continue
      }

      // Two or more surviving runs (the eraser crossed the stroke in more
      // than one place during this drag): delete the original, insert one
      // fresh row per surviving run.
      setObjects(prev => prev.filter(o => o.id !== strokeId))
      broadcastDelete(strokeId)
      await deleteWhiteboardObject(strokeId)

      for (const run of runs) {
        const { x, y, width, height, content } = runToNewStroke(run, original)
        const saved = await insertWhiteboardObject({
          session_id: sessionId,
          object_type: 'stroke',
          x, y, width, height, content,
          created_by: original.created_by,
        })
        setObjects(prev => [...prev, saved])
        broadcastUpsert(saved)
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === 'pen') {
      const { x, y } = relativePosition(e.clientX, e.clientY)
      setDrawingPoints([[x, y]])
    } else if (tool === 'eraser') {
      handleEraserMove(e.clientX, e.clientY)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === 'pen' && drawingPoints.length > 0) {
      const { x, y } = relativePosition(e.clientX, e.clientY)
      setDrawingPoints(prev => [...prev, [x, y]])
    } else if (tool === 'eraser') {
      handleEraserMove(e.clientX, e.clientY)
    }
  }

  async function handlePointerUp() {
    if (tool === 'eraser') {
      await completeErase()
      return
    }

    if (tool !== 'pen' || drawingPoints.length < 2) { setDrawingPoints([]); return }
    const xs = drawingPoints.map(p => p[0])
    const ys = drawingPoints.map(p => p[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    const normalised: [number, number][] = drawingPoints.map(([x, y]) => [x - minX, y - minY])

    const saved = await insertWhiteboardObject({
      session_id: sessionId,
      object_type: 'stroke',
      x: minX, y: minY, width: Math.max(maxX - minX, 0.01), height: Math.max(maxY - minY, 0.01),
      content: { kind: 'stroke', points: normalised, color: penColor, strokeWidth: penWidth },
      created_by: currentUserId,
    })
    setObjects(prev => [...prev, saved])
    broadcastUpsert(saved)
    setDrawingPoints([])
  }

  function handleTextChange(object: WhiteboardObject, text: string) {
    const updated: WhiteboardObject = { ...object, content: { kind: 'text_box', text } }
    setObjects(prev => prev.map(o => (o.id === object.id ? updated : o)))
    broadcastUpsert(updated)

    clearTimeout(textDebounceRef.current[object.id])
    textDebounceRef.current[object.id] = setTimeout(() => {
      updateWhiteboardObjectContent(object.id, updated.content)
    }, 500)
  }

  function beginDrag(e: React.PointerEvent, object: WhiteboardObject, mode: 'move' | 'resize') {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(object.id)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const start = { x: object.x, y: object.y, width: object.width, height: object.height }

    function onMove(ev: PointerEvent) {
      const dxFrac = (ev.clientX - startClientX) / rect!.width
      const dyFrac = (ev.clientY - startClientY) / rect!.height
      setObjects(prev => prev.map(o => {
        if (o.id !== object.id) return o
        if (mode === 'move') {
          return { ...o, x: start.x + dxFrac, y: start.y + dyFrac }
        }
        return { ...o, width: Math.max(0.03, start.width + dxFrac), height: Math.max(0.02, start.height + dyFrac) }
      }))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setObjects(prev => {
        const updated = prev.find(o => o.id === object.id)
        if (updated) {
          broadcastUpsert(updated)
          updateWhiteboardObjectPosition(updated.id, { x: updated.x, y: updated.y, width: updated.width, height: updated.height })
        }
        return prev
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-2">
        <button
          type="button"
          onClick={() => setTool(tool === 'pen' ? null : 'pen')}
          className={`rounded-lg p-2 ${tool === 'pen' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Pen"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}
          className={`rounded-lg p-2 ${tool === 'eraser' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'text' ? null : 'text')}
          className={`rounded-lg p-2 ${tool === 'text' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Add text"
        >
          <Type size={16} />
        </button>
        <StickerPalette
          bucket="whiteboard-stickers"
          buildUploadPath={file => `${sessionId}/${crypto.randomUUID()}-${file.name}`}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />

        {tool === 'pen' && (
          <div className="ml-2 flex items-center gap-2 border-l border-slate-700 pl-2">
            {PEN_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setPenColor(color)}
                title={color}
                className={`h-6 w-6 rounded-full ${penColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
            <div className="ml-2 flex items-center gap-1">
              {PEN_WIDTHS.map(width => (
                <button
                  key={width}
                  type="button"
                  onClick={() => setPenWidth(width)}
                  title={`${width}px`}
                  className={`flex h-6 w-6 items-center justify-center rounded ${penWidth === width ? 'bg-slate-700' : ''}`}
                >
                  <span className="rounded-full bg-white" style={{ width: width + 2, height: width + 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tool && (
        <div className="bg-cyan-600/90 px-3 py-1.5 text-center text-xs font-semibold text-white">
          {tool === 'pen' ? 'Draw on the whiteboard' : tool === 'eraser' ? 'Drag over ink to erase it' : 'Click the whiteboard to place it'}
        </div>
      )}

      <ScrollFade wrapperClassName="flex-1" className="p-4" fadeFrom="from-slate-950">
        <div
          ref={canvasRef}
          className="relative mx-auto bg-white"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : tool ? 'crosshair' : 'default' }}
          onClick={handleCanvasClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {objects
              .filter(o => o.object_type === 'stroke')
              .flatMap(o => {
                const c = o.content as WhiteboardStrokeContent
                const erasedForThis = erasedPointIndicesRef.current.get(o.id)
                const runs = erasedForThis && erasedForThis.size > 0
                  ? contiguousSurvivingRuns(c.points, erasedForThis)
                  : [c.points]
                return runs.map((run, idx) => {
                  const scaled: [number, number][] = run.map(([x, y]) => [
                    (o.x + x * o.width) * CANVAS_WIDTH,
                    (o.y + y * o.height) * CANVAS_HEIGHT,
                  ])
                  return <path key={`${o.id}-${idx}`} d={strokeToPath(scaled, c.strokeWidth)} fill={c.color} />
                })
              })}
            {drawingPoints.length > 1 && (
              <path d={strokeToPath(drawingPoints.map(([x, y]) => [x * CANVAS_WIDTH, y * CANVAS_HEIGHT]), penWidth)} fill={penColor} />
            )}
          </svg>

          {tool === 'eraser' && eraserPos && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-slate-400 bg-slate-200/40"
              style={{
                left: eraserPos.x - ERASER_RADIUS, top: eraserPos.y - ERASER_RADIUS,
                width: ERASER_RADIUS * 2, height: ERASER_RADIUS * 2,
              }}
            />
          )}

          {objects
            .filter(o => o.object_type === 'text_box')
            .map(o => {
              const c = o.content as { kind: 'text_box'; text: string }
              const isSelected = selectedId === o.id
              return (
                <div
                  key={o.id}
                  className="group absolute"
                  style={{ left: `${o.x * CANVAS_WIDTH}px`, top: `${o.y * CANVAS_HEIGHT}px`, width: `${o.width * CANVAS_WIDTH}px`, height: `${o.height * CANVAS_HEIGHT}px` }}
                  onClick={e => { e.stopPropagation(); setSelectedId(o.id) }}
                >
                  {isSelected ? (
                    <>
                      <textarea
                        autoFocus
                        value={c.text}
                        onChange={e => handleTextChange(o, e.target.value)}
                        className="h-full w-full resize-none !border-cyan-400 !bg-white !text-slate-900 border p-1 text-sm focus:outline-none"
                      />
                      <div
                        onPointerDown={e => beginDrag(e, o, 'move')}
                        className="absolute -top-3 left-1/2 flex h-5 w-8 -translate-x-1/2 cursor-move items-center justify-center rounded-full bg-cyan-600 text-white"
                        title="Drag to move"
                      >
                        <Move size={12} />
                      </div>
                      <div
                        onPointerDown={e => beginDrag(e, o, 'resize')}
                        className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-full bg-cyan-600"
                        title="Drag to resize"
                      />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDeleteObject(o.id) }}
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                        title="Delete"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <p className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1 text-sm text-slate-900">
                      {c.text}
                    </p>
                  )}
                </div>
              )
            })}

          {objects
            .filter(o => o.object_type === 'sticker')
            .map(o => {
              const c = o.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              const style = { left: `${o.x * CANVAS_WIDTH}px`, top: `${o.y * CANVAS_HEIGHT}px`, width: `${o.width * CANVAS_WIDTH}px`, height: `${o.height * CANVAS_HEIGHT}px` }
              const deleteButton = (
                <button
                  type="button"
                  onClick={() => handleDeleteObject(o.id)}
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                  title="Delete"
                >
                  ×
                </button>
              )
              if (c.kind === 'sticker_custom') {
                const url = customStickerUrls[c.storagePath]
                return (
                  <div key={o.id} className="group absolute" style={style}>
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
                <div key={o.id} className="group absolute flex items-center justify-center" style={{ ...style, color: sticker.color }}>
                  <Icon size={28} />
                  {deleteButton}
                </div>
              )
            })}
        </div>
      </ScrollFade>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm run build` — must pass clean. This file isn't imported anywhere yet, so this only confirms it type-checks in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/components/whiteboard/WhiteboardCanvas.tsx
git commit -m "feat: add WhiteboardCanvas with pen/eraser/text/sticker tools"
```

---

### Task 6: Plan-gate notice component

**Files:**
- Create: `src/components/whiteboard/WhiteboardGateNotice.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<WhiteboardGateNotice isGuest={boolean} />`. Task 7 renders this instead of `WhiteboardCanvas` when `whiteboardAllowed` is false.

- [ ] **Step 1: Write the component**

```tsx
// src/components/whiteboard/WhiteboardGateNotice.tsx
import Link from 'next/link'
import { Lock } from 'lucide-react'

export default function WhiteboardGateNotice({ isGuest }: { isGuest: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 p-8 text-center">
      <Lock size={28} className="text-slate-500" />
      {isGuest ? (
        <p className="max-w-sm text-sm font-semibold text-slate-300">
          Whiteboard isn&apos;t available for this session.
        </p>
      ) : (
        <>
          <p className="max-w-sm text-sm font-semibold text-slate-300">
            Whiteboard is a Pro feature.
          </p>
          <Link
            href="/dashboard/billing"
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600"
          >
            Upgrade to unlock it →
          </Link>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/whiteboard/WhiteboardGateNotice.tsx
git commit -m "feat: add whiteboard plan-gate notice"
```

---

### Task 7: Wire into CallRoom

**Files:**
- Modify: `src/components/video/CallRoom.tsx`

**Interfaces:**
- Consumes: `WhiteboardCanvas` (Task 5), `WhiteboardGateNotice` (Task 6), the now-generalized `WorksheetFullScreen` (Task 4).
- Produces: `CallRoom` gains two new optional props, `sessionId?: string | null` and `whiteboardAllowed?: boolean`. Task 8 and Task 9 pass these in.

- [ ] **Step 1: Add imports and new props**

Read the file first. Add to the imports (alongside the existing `WorksheetTab`/`WorksheetFullScreen` imports):

```tsx
import WhiteboardCanvas from '@/components/whiteboard/WhiteboardCanvas'
import WhiteboardGateNotice from '@/components/whiteboard/WhiteboardGateNotice'
```

Add to the `Props` type (after `sessionStudentId`):

```tsx
  sessionId?: string | null
  whiteboardAllowed?: boolean
```

Add to the function signature's destructuring (after `sessionStudentId`):

```tsx
sessionId, whiteboardAllowed = false,
```

- [ ] **Step 2: Add state and the gate boolean**

Add alongside the existing `worksheetFullScreen` state:

```tsx
  const [whiteboardFullScreen, setWhiteboardFullScreen] = useState(false)
```

Add alongside the existing `canUseWorksheet` line:

```tsx
  const canUseWhiteboard = !!callId && !!currentUserId && !!sessionId
```

- [ ] **Step 3: Render the full-screen overlay**

Add right after the existing worksheet/program-annotate full-screen blocks (after the closing of the `programAnnotateAsset &&` block, before the "Controls bar" comment):

```tsx
      {whiteboardFullScreen && canUseWhiteboard && (
        <WorksheetFullScreen title="Whiteboard" onClose={() => setWhiteboardFullScreen(false)}>
          {whiteboardAllowed
            ? <WhiteboardCanvas sessionId={sessionId!} currentUserId={currentUserId!} />
            : <WhiteboardGateNotice isGuest={isGuest} />}
        </WorksheetFullScreen>
      )}
```

- [ ] **Step 4: Add the "Whiteboard" button**

Add right after the existing Worksheet button block in the controls bar:

```tsx
        {canUseWhiteboard && (
          <button
            onClick={() => setWhiteboardFullScreen(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
            title="Open whiteboard"
          >
            <Pencil size={15} />
            Whiteboard
          </button>
        )}
```

Add `Pencil` to the existing `lucide-react` import line at the top of the file (alongside `NotebookPen, BookOpen, MessageCircle`).

- [ ] **Step 5: Verify**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/video/CallRoom.tsx
git commit -m "handover: wire Whiteboard button and overlay into CallRoom"
```

---

### Task 8: Wire into the authenticated video call page

**Files:**
- Modify: `src/app/dashboard/video/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `isPaidPlan`, `getSubscription` from `@/lib/subscription` (already exist, no changes).
- Produces: passes `sessionId`/`whiteboardAllowed` into `<CallRoom />`.

- [ ] **Step 1: Add the subscription import**

Read the file first. Add to the imports:

```tsx
import { getSubscription, isPaidPlan } from '@/lib/subscription'
```

- [ ] **Step 2: Resolve `whiteboardAllowed`**

The existing query already selects `session_id`:
`.from('scheduled_calls').select('id, daily_room_name, room_url, created_by, org_id, session_id')`
— no change needed there.

Right after the existing `const { assets: linkedTopicAssets, studentId: sessionStudentId } = call.session_id ? await fetchLinkedTopicAssets(call.session_id, user.id) : { assets: [], studentId: null }` line, add:

```tsx
  let whiteboardAllowed = false
  if (call.session_id) {
    const { data: session } = await supabase
      .from('sessions').select('created_by').eq('id', call.session_id).maybeSingle()
    if (session?.created_by) {
      whiteboardAllowed = isPaidPlan(await getSubscription(session.created_by))
    }
  }
```

- [ ] **Step 3: Pass the new props to `CallRoom`**

Find the `<CallRoom ... />` call at the bottom of the file and add two new props (after `currentUserId={user.id}`):

```tsx
      sessionId={call.session_id}
      whiteboardAllowed={whiteboardAllowed}
```

- [ ] **Step 4: Verify**

Run: `pnpm run build` — must pass clean.

Manual: as a tutor on a paid (Pro/Team) plan, start a call linked to a session, confirm the Whiteboard button opens a working canvas. As a tutor on the free plan, confirm the button still shows but opens the upgrade notice with a working Billing link instead.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/video/[roomId]/page.tsx
git commit -m "handover: resolve whiteboard plan-gating from the session owner's subscription"
```

---

### Task 9: Wire into the guest join path

**Files:**
- Modify: `src/app/join/[guestToken]/page.tsx`
- Modify: `src/components/video/GuestJoinClient.tsx`

**Interfaces:**
- Consumes: `isPaidPlan`, `getSubscription` from `@/lib/subscription`.
- Produces: threads `sessionId`/`whiteboardAllowed` from the guest join page through to `CallRoom`.

Unlike Worksheet Annotation (whose guest side never needs `topicAssetId`/`studentId` up front — the tutor's choice is broadcast to the guest live), the whiteboard has no "selection" step: its `session_id` is a fixed property of the call, not a runtime choice, so it must be fetched here directly, the same way the authenticated page already does.

- [ ] **Step 1: Fetch `session_id` and resolve `whiteboardAllowed`**

Read `src/app/join/[guestToken]/page.tsx` first. Add the import:

```tsx
import { getSubscription, isPaidPlan } from '@/lib/subscription'
```

Change the existing query's nested select from:

```tsx
    .select('id, display_name, scheduled_calls(id, title, starts_at, daily_room_name, room_url)')
```

to:

```tsx
    .select('id, display_name, scheduled_calls(id, title, starts_at, daily_room_name, room_url, session_id)')
```

Update the `call` type cast to include the new field:

```tsx
  const call = (invitee?.scheduled_calls as unknown as {
    id: string
    title: string
    starts_at: string | null
    daily_room_name: string
    room_url: string
    session_id: string | null
  } | null)
```

Right after the existing `if (!call?.daily_room_name || !call?.room_url) { ... }` block, add:

```tsx
  let whiteboardAllowed = false
  if (call.session_id) {
    const { data: session } = await service
      .from('sessions').select('created_by').eq('id', call.session_id).maybeSingle()
    if (session?.created_by) {
      whiteboardAllowed = isPaidPlan(await getSubscription(session.created_by))
    }
  }
```

- [ ] **Step 2: Pass the new props to `GuestJoinClient`**

Add two new props to the `<GuestJoinClient ... />` call:

```tsx
      sessionId={call.session_id}
      whiteboardAllowed={whiteboardAllowed}
```

- [ ] **Step 3: Thread the props through `GuestJoinClient.tsx`**

Read the file first. Add to the `Props` type:

```tsx
  sessionId: string | null
  whiteboardAllowed: boolean
```

Add to the destructured function parameters:

```tsx
sessionId, whiteboardAllowed,
```

Add to the `<CallRoom ... />` call inside the `if (token)` block (after `currentUserId={sessionChat?.userId}`):

```tsx
        sessionId={sessionId}
        whiteboardAllowed={whiteboardAllowed}
```

- [ ] **Step 4: Verify**

Run: `pnpm run build` — must pass clean.

Manual: as a guest joining via an invite link for a session belonging to a Pro/Team tutor, confirm the Whiteboard button opens the same live canvas the tutor sees (drawings sync both ways). As a guest on a free-plan tutor's call, confirm the simpler no-upgrade-link message shows instead.

- [ ] **Step 5: Commit**

```bash
git add src/app/join/[guestToken]/page.tsx src/components/video/GuestJoinClient.tsx
git commit -m "handover: wire whiteboard sessionId and plan-gating into the guest join path"
```

---

## Self-Review

**1. Spec coverage:**
- Session-scoped persistence, no page/student concept → Task 1 (schema), Task 5 (component has no page/pagination). ✓
- Pen 6 colours/3 thicknesses → Task 5 (`PEN_COLORS`, `PEN_WIDTHS`). ✓
- True drag-to-erase, splitting into contiguous surviving runs, ink-only → Task 5 (`contiguousSurvivingRuns`, `runToNewStroke`, `completeErase`, eraser only touches `object_type === 'stroke'`). ✓
- Text/sticker unaffected by eraser, existing select-and-× stays → Task 5 (unchanged from `WorksheetAnnotator`'s pattern). ✓
- Broadcast reuses existing `upsert`/`delete` events, no new event type → Task 5 (`broadcastUpsert`/`broadcastDelete` calls inside `completeErase`). ✓
- `can_edit_whiteboard`, simpler than `can_edit_worksheet` (no topics/subjects hop) → Task 1. ✓
- `whiteboard-stickers` bucket, `{sessionId}/{filename}` path → Task 1 (bucket/policies), Task 5 (`buildUploadPath`). ✓
- `StickerPalette` generalized, worksheets unaffected → Task 4. ✓
- New "Whiteboard" button next to "Worksheet", `WorksheetFullScreen` reused (with a title prop) → Task 4 (generalization), Task 7 (button + overlay). ✓
- Plan gating resolved from the session owner's subscription, not the viewer's; visible-but-locked; tutor sees Billing link, guest sees a plain message → Task 6 (`WhiteboardGateNotice`), Task 8 (authenticated path), Task 9 (guest path). ✓
- No new dependencies → confirmed throughout, `react-pdf` never imported. ✓

**2. Placeholder scan:** No TBD/TODO. Every step has complete, exact code, including the full `WhiteboardCanvas.tsx` file (the plan's largest and riskiest piece — written in full, not summarized).

**3. Type consistency:** `WhiteboardObject`/`WhiteboardObjectContent`/`NewWhiteboardObject` (Task 2) are used with identical shapes across Task 3's lib functions, Task 5's component, and nowhere else. `updateWhiteboardObjectStroke` (introduced in Task 3, beyond a 1:1 mirror of the worksheet lib) is consumed exactly once, in Task 5's `completeErase`, with matching parameter shape (`{ x, y, width, height, content }`). `StickerPalette`'s new `bucket`/`buildUploadPath` props (Task 4) are used identically by both of its call sites — the untouched worksheet one (Task 4 Step 2) and the new whiteboard one (Task 5). `WorksheetFullScreen`'s new required `title` prop (Task 4) is supplied at all three of its call sites by the end of the plan — the two pre-existing ones (Task 4 Step 4) and the new one (Task 7 Step 3) — so nothing is left calling it without a title.

**One gap found and fixed during self-review:** the spec's Real-time sync section illustrates the erase-completion cases as "zero/one/two runs," but a single continuous drag gesture can plausibly cross a curled or looping stroke in more than two places, producing three or more surviving runs. `completeErase`'s actual implementation (Task 5) handles an arbitrary number of runs generally — the "two runs" language in the spec was illustrative, not a hard limit, and the code doesn't special-case exactly two.
