# In-Call Program Reference Panel

## Goal
During a video call linked to a session that has a linked program, let staff open a narrow
slide-in panel to browse that program's files/notes/links without leaving the call — staff-only,
read-only, client never receives this data.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-03-in-call-program-reference-panel-design.md`
- Source plan: `docs/superpowers/plans/2026-07-03-in-call-program-reference-panel.md`
- No schema changes — reuses `scheduled_calls.session_id`, `sessions.program_id`, and the existing
  `LinkedProgramBundle` type/fetch pattern already established by Programs Phase 4.
- Staff-only: only `/dashboard/video/[roomId]/page.tsx` (internal route) fetches `linkedProgram`.
  The guest/`/join/[guestToken]` route never fetches or passes it — structural isolation, not a
  UI toggle.
- Panel is a new component, `ProgramReferencePanel.tsx`, not reusing `CategoryTree`/`AssetGrid`
  (too wide for a narrow slide-in panel) — flat asset list + optional category dropdown instead.
- Notes expand inline on click (no URL to open); files/links open via `signed_url ?? external_url`
  in a new tab, matching `AssetCard.tsx`'s existing `handleOpen()` exactly.
- The program panel and the existing transcript panel share the same screen position — they must
  be mutually exclusive (opening one closes the other) to avoid visual overlap.
- No spend: pure code, internal Supabase reads only, no external API calls.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- Task 4 needs a manual browser smoke test (no test runner) before ticking it done — including the
  guest-isolation check (join as a guest, confirm no program button/panel appears at all).

---

## C-1 — `ProgramReferencePanel` component

*Codex edits:*
- [x] Create `src/components/video/ProgramReferencePanel.tsx`:
  ```typescript
  'use client'

  import { useState } from 'react'
  import { X, FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, FolderOpen } from 'lucide-react'
  import type { LinkedProgramBundle, ProgramAsset, ProgramAssetType } from '@/types/programs'

  const TYPE_ICON: Record<ProgramAssetType, React.ComponentType<{ size?: number; className?: string }>> = {
    pdf:   FileText,
    docx:  FileText,
    xlsx:  FileSpreadsheet,
    image: Image,
    audio: Music,
    video: LinkIcon,
    note:  BookOpen,
    link:  LinkIcon,
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

  export default function ProgramReferencePanel({
    linkedProgram,
    open,
    onClose,
  }: {
    linkedProgram: LinkedProgramBundle | null
    open: boolean
    onClose: () => void
  }) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

    if (!linkedProgram) return null

    const { program, categories, assets } = linkedProgram
    const visibleAssets =
      selectedCategoryId === 'all'
        ? assets
        : assets.filter(a => a.category_id === selectedCategoryId)

    function handleAssetClick(asset: ProgramAsset) {
      if (asset.asset_type === 'note') {
        setExpandedNoteId(prev => (prev === asset.id ? null : asset.id))
        return
      }
      const url = asset.signed_url ?? asset.external_url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }

    return (
      <div
        className={`absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white"
              style={{ backgroundColor: program.cover_colour }}
            >
              <FolderOpen size={11} />
            </span>
            <span className="text-xs font-bold text-slate-200 truncate">{program.name}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X size={14} />
          </button>
        </div>

        {categories.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-700 shrink-0">
            <select
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="all">All categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleAssets.length === 0 ? (
            <p className="text-xs text-slate-500 px-1 py-2">No files in this program yet.</p>
          ) : (
            visibleAssets.map(asset => {
              const Icon = TYPE_ICON[asset.asset_type] ?? File
              const colour = TYPE_COLOUR[asset.asset_type] ?? '#64748b'
              const isExpandedNote = asset.asset_type === 'note' && expandedNoteId === asset.id
              return (
                <div key={asset.id}>
                  <button
                    onClick={() => handleAssetClick(asset)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 transition-colors"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                      style={{ backgroundColor: `${colour}33`, color: colour }}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="text-xs text-slate-200 truncate">{asset.name}</span>
                  </button>
                  {isExpandedNote && (
                    <p className="mx-2 mb-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 whitespace-pre-line">
                      {asset.note_content}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }
  ```
  (The URL precedence in `handleAssetClick` — `signed_url` then `external_url` — matches
  `src/components/programs/AssetCard.tsx`'s existing `handleOpen()` exactly. The panel's
  positioning/animation classes are copied from the existing transcript panel in `CallRoom.tsx`
  for visual consistency. `TYPE_ICON`/`TYPE_COLOUR` are a deliberate small copy from
  `AssetCard.tsx`, not a shared import — that file doesn't export them, and this keeps the two
  call sites decoupled.)

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet — checks it compiles standalone.
- [x] Commit: `git add src/components/video/ProgramReferencePanel.tsx && git commit -m "feat: in-call program reference panel — ProgramReferencePanel component"`

---

## C-2 — Fetch the linked program bundle on the call page

*Codex edits:*
- [x] Read `src/app/dashboard/video/[roomId]/page.tsx` first to confirm current structure, then
  replace its full contents:
  ```typescript
  import { redirect } from 'next/navigation'
  import { createClient } from '@/lib/supabase-server'
  import { createServiceClient } from '@/lib/supabase-service'
  import { createProgramAssetSignedUrl } from '@/lib/program-storage'
  import CallRoom from '@/components/video/CallRoom'
  import type { LinkedProgramBundle, Program, ProgramAsset } from '@/types/programs'

  const DAILY_API = 'https://api.daily.co/v1'

  async function issueOrgMemberToken(roomName: string, isOwner: boolean, userName: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
    const res = await fetch(`${DAILY_API}/meeting-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { room_name: roomName, is_owner: isOwner, exp, user_name: userName },
      }),
    })
    if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
    const data = await res.json() as { token: string }
    return data.token
  }

  async function fetchLinkedProgram(sessionId: string, userId: string): Promise<LinkedProgramBundle | null> {
    const service = createServiceClient()

    const { data: session } = await service
      .from('sessions').select('program_id').eq('id', sessionId).maybeSingle()
    if (!session?.program_id) return null

    const { data: program } = await service
      .from('programs').select('*').eq('id', session.program_id).maybeSingle()
    if (!program) return null

    const { data: membership } = await service
      .from('organisation_members').select('role')
      .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
    const isOwner = program.owner_id === userId
    if (!isOwner && !membership) return null

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

    return {
      program: program as Program,
      categories: categories ?? [],
      assets: assetsWithUrls,
    }
  }

  export default async function CallRoomPage({
    params,
  }: {
    params: Promise<{ roomId: string }>
  }) {
    const { roomId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: call } = await supabase
      .from('scheduled_calls')
      .select('id, daily_room_name, room_url, created_by, org_id, session_id')
      .eq('id', roomId)
      .maybeSingle()

    if (!call?.daily_room_name || !call?.room_url) redirect('/dashboard/video')

    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from('organisation_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', call.org_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (!membership) redirect('/dashboard/video')

    const p = profile as unknown as { full_name: string | null; email: string | null } | null
    const userName = p?.full_name || p?.email || 'Participant'

    const linkedProgram = call.session_id ? await fetchLinkedProgram(call.session_id, user.id) : null

    let token: string
    try {
      token = await issueOrgMemberToken(call.daily_room_name, call.created_by === user.id, userName)
    } catch {
      redirect('/dashboard/video')
    }

    return (
      <CallRoom
        roomUrl={call.room_url}
        token={token!}
        dailyRoomName={call.daily_room_name}
        isCreator={call.created_by === user.id}
        callId={roomId}
        linkedProgram={linkedProgram}
      />
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — expect a type error on `<CallRoom ... linkedProgram={linkedProgram} />`
  (CallRoom doesn't accept that prop yet) — expected here, fixed by C-3.
- [x] Commit: `git add "src/app/dashboard/video/[roomId]/page.tsx" && git commit -m "feat: in-call program reference panel — fetch linked program on the call page"`

---

## C-3 — Wire the panel into `CallRoom`

*Codex edits:*
- [x] Read `src/components/video/CallRoom.tsx` first to confirm current structure, then replace
  its full contents:
  ```typescript
  'use client'

  import { useEffect, useRef, useState } from 'react'
  import { useRouter } from 'next/navigation'
  import DailyIframe from '@daily-co/daily-js'
  import { NotebookPen, X, BookOpen } from 'lucide-react'
  import ProgramReferencePanel from './ProgramReferencePanel'
  import type { LinkedProgramBundle } from '@/types/programs'

  type TranscriptLine = { speaker: string; text: string; ts: string }

  type Props = {
    roomUrl: string
    token: string
    dailyRoomName: string
    isCreator: boolean
    callId?: string
    linkedProgram?: LinkedProgramBundle | null
  }

  export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, callId, linkedProgram }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
    const chunkBufferRef = useRef<string>('')
    const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcriptEndRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const [noteState, setNoteState] = useState<'idle' | 'active' | 'stopped'>('idle')
    const [panelOpen, setPanelOpen] = useState(false)
    const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([])
    const [programPanelOpen, setProgramPanelOpen] = useState(false)

    async function flushBuffer() {
      const chunk = chunkBufferRef.current
      if (!chunk || !callId) return
      chunkBufferRef.current = ''
      await fetch(`/api/video/notes/${callId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk }),
      }).catch(() => {})
    }

    async function finaliseNotes() {
      if (!callId) return
      await flushBuffer()
      await fetch(`/api/video/notes/${callId}/summarise`, { method: 'POST' }).catch(() => {})
    }

    useEffect(() => {
      if (!containerRef.current) return

      const frame = DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: false,
        showFullscreenButton: true,
        iframeStyle: {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
          border: 'none',
        },
      })

      frame.join({ url: roomUrl, token })
      frameRef.current = frame

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frame.on('transcription-message' as any, (evt: any) => {
        // user_name comes from the meeting token — falls back to session-ID lookup
        const participants = frame.participants() as Record<string, { user_name?: string; session_id?: string }> | null
        const fromToken = evt?.user_name as string | undefined
        const fromParticipants = Object.values(participants || {}).find(
          p => p.session_id === evt?.participantId
        )?.user_name
        const speaker = fromToken || fromParticipants || 'Participant'
        const text = (evt?.text ?? '') as string
        if (!text.trim()) return
        const ts = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        setTranscriptLines(prev => {
          const last = prev[prev.length - 1]
          if (last && last.speaker === speaker && last.ts === ts) {
            return [...prev.slice(0, -1), { ...last, text: last.text + ' ' + text }]
          }
          return [...prev, { speaker, text, ts }]
        })
        chunkBufferRef.current += ` [${speaker}]: ${text}`
      })

      frame.on('left-meeting', async () => {
        if (flushIntervalRef.current) clearInterval(flushIntervalRef.current)
        await finaliseNotes()
        router.push('/dashboard/video')
      })

      return () => {
        if (flushIntervalRef.current) clearInterval(flushIntervalRef.current)
        frame.destroy()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [transcriptLines])

    function startNotes() {
      if (!callId) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(frameRef.current as any)?.startTranscription({ language: 'en', model: 'nova-2', punctuate: true, endpointing: 500 })
      setNoteState('active')
      setPanelOpen(true)
      setProgramPanelOpen(false)
      flushIntervalRef.current = setInterval(flushBuffer, 30000)
    }

    function toggleTranscriptPanel() {
      setPanelOpen(p => {
        const next = !p
        if (next) setProgramPanelOpen(false)
        return next
      })
    }

    function toggleProgramPanel() {
      setProgramPanelOpen(p => {
        const next = !p
        if (next) setPanelOpen(false)
        return next
      })
    }

    async function handleLeave() {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current)
      if (noteState === 'active') await finaliseNotes()
      frameRef.current?.leave()
    }

    async function handleEndForEveryone() {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current)
      if (noteState === 'active') await finaliseNotes()
      await fetch(`/api/video/rooms/${dailyRoomName}`, { method: 'DELETE' })
      frameRef.current?.leave()
    }

    return (
      <div className="relative flex flex-col bg-slate-950" style={{ height: '100dvh' }}>
        {/* Recording banner */}
        {noteState === 'active' && (
          <div className="absolute top-0 inset-x-0 z-10 bg-red-600/90 text-white text-xs font-semibold text-center py-1.5">
            🔴 Note-taking is active — all participants are being transcribed
          </div>
        )}

        {/* Daily.co iframe */}
        <div ref={containerRef} className="relative flex-1 min-h-0" />

        {/* Transcript panel */}
        <div
          className={`absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform duration-200 ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Live Transcript</span>
            <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-200">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {transcriptLines.length === 0 ? (
              <p className="text-xs text-slate-500">Transcript will appear here as people speak…</p>
            ) : (
              transcriptLines.map((line, i) => (
                <div key={i}>
                  <span className="text-xs font-semibold text-violet-400">{line.speaker}</span>
                  <span className="text-slate-500 text-xs ml-1">{line.ts}</span>
                  <p className="text-slate-200 text-xs mt-0.5">{line.text}</p>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Program reference panel */}
        <ProgramReferencePanel
          linkedProgram={linkedProgram ?? null}
          open={programPanelOpen}
          onClose={() => setProgramPanelOpen(false)}
        />

        {/* Controls bar */}
        <div
          className="flex shrink-0 items-center justify-center gap-3 bg-slate-900 px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Notes button */}
          <button
            onClick={noteState === 'idle' ? startNotes : toggleTranscriptPanel}
            className={`relative px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 ${
              noteState === 'active'
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
            title={noteState === 'idle' ? 'Start note-taking' : noteState === 'active' ? 'Toggle transcript panel' : 'Notes stopped'}
          >
            <NotebookPen size={15} />
            {noteState === 'idle' ? 'Take notes' : noteState === 'active' ? 'Notes' : 'Notes'}
            {noteState === 'active' && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {/* Program panel button — only when a program is linked */}
          {linkedProgram && (
            <button
              onClick={toggleProgramPanel}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
              title="Toggle program reference panel"
            >
              <BookOpen size={15} />
              Program
            </button>
          )}

          <button
            onClick={handleLeave}
            className="px-6 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition-colors shadow-lg"
          >
            Leave call
          </button>
          {isCreator && (
            <button
              onClick={handleEndForEveryone}
              className="px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-lg"
            >
              End for everyone
            </button>
          )}
        </div>
      </div>
    )
  }
  ```
  (`linkedProgram` is optional so `GuestJoinClient.tsx`'s existing `<CallRoom ... />` call, which
  never passes it, keeps compiling unchanged — guests get `null`, no button, no panel. The
  transcript panel and program panel share the same screen position, so opening one closes the
  other.)

*Conductor:*
- [x] `pnpm run build` — must pass clean now (the C-2 mismatch is resolved).
- [x] Commit: `git add src/components/video/CallRoom.tsx && git commit -m "feat: in-call program reference panel — wire panel + toggle button into CallRoom"`

---

## C-4 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner):
  1. Open a session that has a linked program, schedule/join its video call as staff. Confirm a
     "Program" button appears in the control bar.
  2. Click it — confirm the panel slides in from the right showing the linked program's assets.
  3. If the program has categories, confirm the dropdown filters correctly; if none, confirm the
     dropdown is absent and all assets show in one flat list.
  4. Click a file/link asset — confirm it opens in a new tab via its signed URL.
  5. Click a note asset — confirm its text expands inline in the panel (not a new tab).
  6. With the program panel open, toggle "Take notes"/transcript — confirm the program panel
     closes and the transcript panel takes its place, and vice versa.
  7. Join a call for a session with no linked program (or an ad-hoc call with no session at all)
     — confirm the "Program" button does not appear.
  8. Join the same call as a guest via its `/join/[guestToken]` link — confirm there is no
     "Program" button and no program panel at all in the guest's call window.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: `ProgramReferencePanel` compiles clean, matches the approved design
- [x] C-2: call page fetches `linkedProgram` via the session's `program_id`
- [x] C-3: `CallRoom` shows the button only when linked, panels are mutually exclusive, guests
  never receive the prop
- [ ] C-4: full manual smoke test passes, including the guest-isolation check

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-4 (no test runner in this project).
