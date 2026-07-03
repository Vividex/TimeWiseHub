# Room Chat + Client Delivery

## Goal
Add a "Chat" tab to the in-call panel (joining Transcript and Program from Phase 1), scoped to one
video call's participants (staff + the client), letting staff actually hand the client files/links
from the linked program — not just show them via screen share.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-03-room-chat-client-delivery-design.md`
- Source plan: `docs/superpowers/plans/2026-07-03-room-chat-client-delivery.md`
- Team chat's existing tables/RPC/storage/RLS reused almost entirely unmodified — only a new
  `chat_conversations.type = 'session'` value, a `session_id` column, and a `guest_chat_user_id`
  column on `clients`.
- Guest identity: ONE real (admin-created, non-anonymous) `profiles` row per client, stored on
  `clients.guest_chat_user_id`, created once and reused forever — never a fresh account per call.
  Plain anonymous auth doesn't work (`profiles.email` is `NOT NULL`).
- Sharing a program asset into chat posts a message referencing it (name + link) — never copies
  the file into chat's own storage.
- Session-type conversations never appear in the normal Team Chat inbox.
- The two panels from Phase 1 (transcript, program) are refactored into one shared tabbed shell
  (`CallPanel`) so Chat has somewhere to live without a third competing slide-in panel.
- Reuses `send_chat_message` RPC (via existing `/api/chat/send`), `chat-attachments` storage
  bucket, `MessageComposer`, `AttachmentChip`, `ChatMessage`/`ChatAttachment` types — no parallel
  send/receive mechanism built from scratch.
- No spend: pure code + Supabase admin API calls (no external paid API).

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants except inside the call room UI itself, which
  is hard-coded dark throughout (matches Phase 1's existing panels — no `dark:` needed there).

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (no Codex dispatch) — two DB migrations via Supabase MCP (the enum-value
  migration MUST be applied and committed before the structural one, in separate `apply_migration`
  calls — Postgres requires a new enum value to be committed before it can be referenced).
- C-11 needs a manual browser smoke test (no test runner) before ticking it done — this feature
  touches live Supabase Auth (admin-created users, magic-link sign-in), so this pass is the only
  real verification that guest identity works end to end.

---

## C-1 — Database migrations

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-077-session-chat-enum.sql`:
  ```sql
  alter type public.chat_conversation_type add value 'session';
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `session_chat_enum`).
- [x] Create `supabase/schema-078-session-chat.sql`:
  ```sql
  alter table public.chat_conversations
    add column session_id uuid references public.sessions(id) on delete cascade;

  create unique index chat_conversations_session
    on public.chat_conversations (session_id) where session_id is not null;

  alter table public.clients
    add column guest_chat_user_id uuid references public.profiles(id);

  -- Session-type conversations behave like DMs for posting purposes: any participant may post,
  -- no org-role gate (unlike channels).
  create or replace function public.can_post_chat(p_conversation uuid)
  returns boolean language plpgsql security definer stable set search_path = public as $$
  declare
    v_type public.chat_conversation_type;
    v_org  uuid;
  begin
    select type, org_id into v_type, v_org
    from public.chat_conversations where id = p_conversation;
    if v_type is null then return false; end if;
    if not exists (
      select 1 from public.chat_participants
      where conversation_id = p_conversation and user_id = auth.uid()
    ) then
      return false;
    end if;
    if v_type = 'dm' or v_type = 'session' then
      return true;
    end if;
    return exists (
      select 1 from public.organisation_members om
      where om.org_id = v_org and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    );
  end;
  $$;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `session_chat`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'chat_conversations' and column_name = 'session_id')
      or (table_name = 'clients' and column_name = 'guest_chat_user_id'));
  ```
  Expected: 2 rows — `session_id` (uuid, nullable), `guest_chat_user_id` (uuid, nullable).
- [x] Commit: `git add supabase/schema-077-session-chat-enum.sql supabase/schema-078-session-chat.sql && git commit -m "feat: room chat + client delivery — database migrations"`

---

## C-2 — `session-chat.ts` helpers

*Codex edits:*
- [x] Create `src/lib/session-chat.ts`:
  ```typescript
  import { createServiceClient } from '@/lib/supabase-service'

  export async function ensureGuestChatUser(clientId: string): Promise<{ userId: string; email: string }> {
    const service = createServiceClient()
    const { data: client } = await service
      .from('clients').select('id, email, guest_chat_user_id').eq('id', clientId).maybeSingle()

    if (!client?.email) throw new Error('Client has no email on file')
    if (client.guest_chat_user_id) return { userId: client.guest_chat_user_id, email: client.email }

    const { data: created, error } = await service.auth.admin.createUser({
      email: client.email,
      email_confirm: true,
      user_metadata: { is_client_guest: true, client_id: client.id },
    })

    if (error || !created.user) {
      // Lost a race with a concurrent call for the same client (e.g. two guest tabs) — the other
      // call already created the user; re-read what it stored.
      const { data: retry } = await service
        .from('clients').select('guest_chat_user_id').eq('id', clientId).maybeSingle()
      if (retry?.guest_chat_user_id) return { userId: retry.guest_chat_user_id, email: client.email }
      throw new Error(`Failed to create guest chat user: ${error?.message}`)
    }

    await service.from('clients').update({ guest_chat_user_id: created.user.id }).eq('id', clientId)
    return { userId: created.user.id, email: client.email }
  }

  export async function mintGuestChatToken(email: string): Promise<string> {
    const service = createServiceClient()
    const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data.properties?.hashed_token) throw new Error(`Failed to mint guest chat token: ${error?.message}`)
    return data.properties.hashed_token
  }

  export async function ensureSessionChatParticipant(sessionId: string, userId: string): Promise<string> {
    const service = createServiceClient()

    let conversationId: string | null = null

    const { data: existing } = await service
      .from('chat_conversations').select('id').eq('session_id', sessionId).eq('type', 'session').maybeSingle()

    if (existing) {
      conversationId = existing.id
    } else {
      const { data: session } = await service.from('sessions').select('org_id').eq('id', sessionId).maybeSingle()
      if (!session?.org_id) throw new Error('Session has no organisation')

      const { data: created, error } = await service
        .from('chat_conversations')
        .insert({ org_id: session.org_id, type: 'session', session_id: sessionId })
        .select('id')
        .single()

      if (created) {
        conversationId = created.id
      } else {
        // Lost a race with a concurrent create (e.g. two staff opening the call at once) — the
        // unique index on session_id means exactly one insert wins; re-fetch the winner's row.
        const { data: retry } = await service
          .from('chat_conversations').select('id').eq('session_id', sessionId).eq('type', 'session').maybeSingle()
        if (!retry) throw new Error(`Failed to create session chat: ${error?.message}`)
        conversationId = retry.id
      }
    }

    await service
      .from('chat_participants')
      .upsert(
        { conversation_id: conversationId, user_id: userId },
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
      )

    return conversationId
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet. (One type-narrowing fixup
  needed on `ensureSessionChatParticipant`'s `conversationId` declaration — fixed, verified clean.)
- [x] Commit: `git add src/lib/session-chat.ts && git commit -m "feat: room chat + client delivery — session-chat.ts helpers"`

---

## C-3 — `CallPanel` shared tabbed shell

*Codex edits:*
- [x] Create `src/components/video/CallPanel.tsx`:
  ```typescript
  'use client'

  import { X } from 'lucide-react'

  export type CallPanelTabId = 'transcript' | 'program' | 'chat'

  const TAB_LABEL: Record<CallPanelTabId, string> = {
    transcript: 'Transcript',
    program: 'Program',
    chat: 'Chat',
  }

  export default function CallPanel({
    open,
    activeTab,
    availableTabs,
    onSelectTab,
    onClose,
    children,
  }: {
    open: boolean
    activeTab: CallPanelTabId
    availableTabs: CallPanelTabId[]
    onSelectTab: (tab: CallPanelTabId) => void
    onClose: () => void
    children: React.ReactNode
  }) {
    return (
      <div
        className={`absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2 shrink-0">
          <div className="flex gap-1">
            {availableTabs.map(tab => (
              <button
                key={tab}
                onClick={() => onSelectTab(tab)}
                className={`rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                  activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet.
- [x] Commit: `git add src/components/video/CallPanel.tsx && git commit -m "feat: room chat + client delivery — CallPanel shared tabbed shell"`

---

## C-4 — Refactor `ProgramReferencePanel` — content-only + share-to-chat

*Codex edits:*
- [x] Read `src/components/programs/ProgramReferencePanel.tsx` first (stale path — actual file is
  `src/components/video/ProgramReferencePanel.tsx`, caught and corrected by Codex), then replace
  its full
  contents:
  ```typescript
  'use client'

  import { useState } from 'react'
  import { FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, Send } from 'lucide-react'
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
    sessionChat,
  }: {
    linkedProgram: LinkedProgramBundle
    sessionChat: { conversationId: string } | null
  }) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
    const [sharingId, setSharingId] = useState<string | null>(null)

    const { categories, assets } = linkedProgram
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

    async function shareToChat(asset: ProgramAsset) {
      if (!sessionChat) return
      setSharingId(asset.id)
      const body = asset.asset_type === 'note'
        ? `Shared: ${asset.name}\n\n${asset.note_content ?? ''}`
        : `Shared: ${asset.name}\n${asset.signed_url ?? asset.external_url ?? ''}`
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: sessionChat.conversationId, body }),
      }).catch(() => {})
      setSharingId(null)
    }

    return (
      <>
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAssetClick(asset)}
                      className="flex flex-1 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 transition-colors"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                        style={{ backgroundColor: `${colour}33`, color: colour }}
                      >
                        <Icon size={13} />
                      </span>
                      <span className="text-xs text-slate-200 truncate">{asset.name}</span>
                    </button>
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
                  </div>
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
      </>
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — expect a type error in `CallRoom.tsx` (still renders the old props
  shape). Expected here, fixed by C-6.
- [x] Commit: `git add src/components/video/ProgramReferencePanel.tsx && git commit -m "feat: room chat + client delivery — ProgramReferencePanel content-only + share-to-chat"`

---

## C-5 — `RoomChatTab` component

*Codex edits:*
- [x] Create `src/components/video/RoomChatTab.tsx`: (Codex added minor cosmetic extras —
  timestamps per message, slightly wider bubbles — functionally identical to spec, accepted)
  ```typescript
  'use client'

  import { useEffect, useMemo, useState } from 'react'
  import { createClient } from '@/lib/supabase-browser'
  import AttachmentChip from '@/components/chat/AttachmentChip'
  import MessageComposer from '@/components/chat/MessageComposer'
  import type { ChatMessage } from '@/lib/chat/types'

  const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

  export default function RoomChatTab({ conversationId, userId }: { conversationId: string; userId: string }) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [names, setNames] = useState<Record<string, string>>({})
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
      let cancelled = false
      ;(async () => {
        const { data } = await supabase
          .from('chat_messages')
          .select(MESSAGE_SELECT)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200)
        if (!cancelled) setMessages((data ?? []) as unknown as ChatMessage[])
      })()
      return () => { cancelled = true }
    }, [conversationId, supabase])

    useEffect(() => {
      let cancelled = false
      ;(async () => {
        const { data } = await supabase
          .from('chat_participants')
          .select('user_id, profiles(full_name, email)')
          .eq('conversation_id', conversationId)
        if (cancelled || !data) return
        const map: Record<string, string> = {}
        for (const row of data as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[]) {
          map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'Unknown'
        }
        setNames(map)
      })()
      return () => { cancelled = true }
    }, [conversationId, supabase])

    useEffect(() => {
      const channel = supabase
        .channel(`session-chat-${conversationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
          async (payload) => {
            const id = (payload.new as { id: string }).id
            const { data } = await supabase
              .from('chat_messages')
              .select(MESSAGE_SELECT)
              .eq('id', id)
              .maybeSingle()
            if (!data) return
            setMessages(prev =>
              prev.some(m => m.id === (data as unknown as ChatMessage).id)
                ? prev
                : [...prev, data as unknown as ChatMessage],
            )
          },
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }, [conversationId, supabase])

    return (
      <>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-500 px-1 py-2">No messages yet.</p>
          ) : (
            messages.map(m => {
              const mine = m.sender_id === userId
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <span className="mb-0.5 px-1 text-[10px] font-semibold text-slate-400">
                    {mine ? 'You' : names[m.sender_id] ?? 'Unknown'}
                  </span>
                  <div className={`max-w-[220px] rounded-2xl px-3 py-1.5 text-xs ${mine ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                    {m.deleted_at ? 'message removed' : m.body}
                  </div>
                  {!m.deleted_at && m.chat_attachments?.map(a => <AttachmentChip key={a.id} attachment={a} />)}
                </div>
              )
            })
          )}
        </div>
        <MessageComposer conversationId={conversationId} canPost userId={userId} />
      </>
    )
  }
  ```

*Conductor:*
- [x] `pnpm run build` — new file compiles clean (pre-existing expected type error in
  `CallRoom.tsx` from C-4 remains, unrelated, fixed by C-6).
- [x] Commit: `git add src/components/video/RoomChatTab.tsx && git commit -m "feat: room chat + client delivery — RoomChatTab component"`

---

## C-6 — Refactor `CallRoom` — unified tabbed panel

*Codex edits:*
- [x] Read `src/components/video/CallRoom.tsx` first, then replace its full contents:
  ```typescript
  'use client'

  import { useEffect, useRef, useState } from 'react'
  import { useRouter } from 'next/navigation'
  import DailyIframe from '@daily-co/daily-js'
  import { NotebookPen, BookOpen, MessageCircle } from 'lucide-react'
  import CallPanel, { type CallPanelTabId } from './CallPanel'
  import ProgramReferencePanel from '@/components/video/ProgramReferencePanel'
  import RoomChatTab from './RoomChatTab'
  import type { LinkedProgramBundle } from '@/types/programs'

  type TranscriptLine = { speaker: string; text: string; ts: string }

  type Props = {
    roomUrl: string
    token: string
    dailyRoomName: string
    isCreator: boolean
    callId?: string
    linkedProgram?: LinkedProgramBundle | null
    sessionChat?: { conversationId: string; userId: string } | null
  }

  export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, callId, linkedProgram, sessionChat }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
    const chunkBufferRef = useRef<string>('')
    const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcriptEndRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const [noteState, setNoteState] = useState<'idle' | 'active' | 'stopped'>('idle')
    const [panelOpen, setPanelOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<CallPanelTabId>('transcript')
    const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([])

    const availableTabs: CallPanelTabId[] = [
      'transcript',
      ...(linkedProgram ? (['program'] as const) : []),
      ...(sessionChat ? (['chat'] as const) : []),
    ]

    function openTab(tab: CallPanelTabId) {
      if (panelOpen && activeTab === tab) {
        setPanelOpen(false)
      } else {
        setActiveTab(tab)
        setPanelOpen(true)
      }
    }

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

    function handleNotesClick() {
      if (noteState === 'idle') {
        if (callId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(frameRef.current as any)?.startTranscription({ language: 'en', model: 'nova-2', punctuate: true, endpointing: 500 })
          setNoteState('active')
          flushIntervalRef.current = setInterval(flushBuffer, 30000)
        }
      }
      openTab('transcript')
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

        {/* Unified tabbed panel */}
        <CallPanel
          open={panelOpen}
          activeTab={activeTab}
          availableTabs={availableTabs}
          onSelectTab={setActiveTab}
          onClose={() => setPanelOpen(false)}
        >
          {activeTab === 'transcript' && (
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
          )}
          {activeTab === 'program' && linkedProgram && (
            <ProgramReferencePanel linkedProgram={linkedProgram} sessionChat={sessionChat ?? null} />
          )}
          {activeTab === 'chat' && sessionChat && (
            <RoomChatTab conversationId={sessionChat.conversationId} userId={sessionChat.userId} />
          )}
        </CallPanel>

        {/* Controls bar */}
        <div
          className="flex shrink-0 items-center justify-center gap-3 bg-slate-900 px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Notes button */}
          <button
            onClick={handleNotesClick}
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
              onClick={() => openTab('program')}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
              title="Toggle program reference panel"
            >
              <BookOpen size={15} />
              Program
            </button>
          )}

          {/* Chat button — only when session chat is available */}
          {sessionChat && (
            <button
              onClick={() => openTab('chat')}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
              title="Toggle chat"
            >
              <MessageCircle size={15} />
              Chat
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

*Conductor:*
- [x] `pnpm run build` — must pass clean now (the C-4 mismatch is resolved).
- [x] Commit: `git add src/components/video/CallRoom.tsx && git commit -m "feat: room chat + client delivery — CallRoom unified tabbed panel"`

---

## C-7 — Wire staff chat participancy on the call page

*Codex edits:*
- [x] Read `src/app/dashboard/video/[roomId]/page.tsx` first, then add the import:
  ```typescript
  import { ensureSessionChatParticipant } from '@/lib/session-chat'
  ```
  After the existing `const linkedProgram = call.session_id ? await fetchLinkedProgram(call.session_id, user.id) : null`
  line, add:
  ```typescript
  const sessionChat = call.session_id
    ? { conversationId: await ensureSessionChatParticipant(call.session_id, user.id), userId: user.id }
    : null
  ```
  Update the final `<CallRoom ... />` render to add `sessionChat={sessionChat}` alongside the
  existing `linkedProgram={linkedProgram}` prop. Nothing else in this file changes.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/video/[roomId]/page.tsx" && git commit -m "feat: room chat + client delivery — staff chat participancy on the call page"`

---

## C-8 — Wire guest chat identity and sign-in

*Codex edits:*
- [ ] Read `src/app/api/video/token/route.ts` first, add the import:
  ```typescript
  import { ensureGuestChatUser, ensureSessionChatParticipant, mintGuestChatToken } from '@/lib/session-chat'
  ```
  Replace the guest-token branch:
  ```typescript
  // External guest path
  if (guestToken) {
    const service = createServiceClient()
    const { data: invitee } = await service
      .from('call_invitees')
      .select('id, call_id, scheduled_calls(daily_room_name)')
      .eq('guest_token', guestToken)
      .maybeSingle()

    if (!invitee) return NextResponse.json({ error: 'Invalid guest token' }, { status: 403 })

    const roomName = (invitee.scheduled_calls as unknown as { daily_room_name: string } | null)
      ?.daily_room_name
    if (roomName !== room) return NextResponse.json({ error: 'Token/room mismatch' }, { status: 403 })

    const token = await issueToken(room, false, displayName)
    return NextResponse.json({ token })
  }
  ```
  with:
  ```typescript
  // External guest path
  if (guestToken) {
    const service = createServiceClient()
    const { data: invitee } = await service
      .from('call_invitees')
      .select('id, call_id, scheduled_calls(daily_room_name, session_id)')
      .eq('guest_token', guestToken)
      .maybeSingle()

    if (!invitee) return NextResponse.json({ error: 'Invalid guest token' }, { status: 403 })

    const inviteeCall = invitee.scheduled_calls as unknown as { daily_room_name: string; session_id: string | null } | null
    if (inviteeCall?.daily_room_name !== room) return NextResponse.json({ error: 'Token/room mismatch' }, { status: 403 })

    const token = await issueToken(room, false, displayName)

    let chat: { conversationId: string; email: string; tokenHash: string } | null = null
    if (inviteeCall.session_id) {
      const { data: session } = await service
        .from('sessions').select('client_id').eq('id', inviteeCall.session_id).maybeSingle()
      if (session?.client_id) {
        try {
          const { userId, email } = await ensureGuestChatUser(session.client_id)
          const conversationId = await ensureSessionChatParticipant(inviteeCall.session_id, userId)
          const tokenHash = await mintGuestChatToken(email)
          chat = { conversationId, email, tokenHash }
        } catch {
          chat = null // chat is a bonus, not a call-joining requirement — never block the video join over it
        }
      }
    }

    return NextResponse.json({ token, chat })
  }
  ```
- [ ] `src/app/join/[guestToken]/page.tsx` needs NO changes — it already passes `guestToken`
  through to `GuestJoinClient` unchanged; confirm this by reading it.
- [ ] Read `src/components/video/GuestJoinClient.tsx` first, then replace its full contents:
  ```typescript
  'use client'

  import { useState } from 'react'
  import CallRoom from './CallRoom'
  import { createClient } from '@/lib/supabase-browser'

  type Props = {
    callTitle: string
    roomUrl: string
    dailyRoomName: string
    guestToken: string
    defaultName: string
  }

  export default function GuestJoinClient({ callTitle, roomUrl, dailyRoomName, guestToken, defaultName }: Props) {
    const [name, setName] = useState(defaultName)
    const [token, setToken] = useState<string | null>(null)
    const [sessionChat, setSessionChat] = useState<{ conversationId: string; userId: string } | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleJoin(e: React.FormEvent) {
      e.preventDefault()
      if (!name.trim()) return
      setLoading(true)
      setError(null)

      const res = await fetch(
        `/api/video/token?room=${encodeURIComponent(dailyRoomName)}&guestToken=${encodeURIComponent(guestToken)}&displayName=${encodeURIComponent(name.trim())}`,
      )

      if (!res.ok) {
        setError('Unable to join — this link may have expired.')
        setLoading(false)
        return
      }

      const { token: t, chat } = await res.json() as {
        token: string
        chat: { conversationId: string; email: string; tokenHash: string } | null
      }

      if (chat) {
        const supabase = createClient()
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email: chat.email,
          token_hash: chat.tokenHash,
          type: 'email',
        })
        if (!verifyError && data.user) {
          setSessionChat({ conversationId: chat.conversationId, userId: data.user.id })
        }
      }

      setToken(t)
    }

    if (token) {
      return (
        <CallRoom
          roomUrl={roomUrl}
          token={token}
          dailyRoomName={dailyRoomName}
          isCreator={false}
          sessionChat={sessionChat}
        />
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-1">You&apos;re invited</h1>
          <p className="text-slate-400 text-sm mb-6">{callTitle}</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Enter your name"
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Joining…' : 'Join call'}
            </button>
          </form>
        </div>
      </div>
    )
  }
  ```
  (If `verifyOtp` fails, `sessionChat` simply stays `null` — the guest still joins the video call
  normally, just without the Chat tab.)

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add "src/app/api/video/token/route.ts" src/components/video/GuestJoinClient.tsx && git commit -m "feat: room chat + client delivery — guest chat identity and sign-in"`

---

## C-9 — Exclude session-type conversations from Team Chat + fix notification URL

*Codex edits:*
- [ ] Read `src/components/chat/ChatRealtimeProvider.tsx` first, change `loadConversations`:
  ```typescript
  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, org_id, type, title, dm_key, created_by, created_at')
      .in('type', ['channel', 'dm'])
      .order('created_at', { ascending: true })
    setConversations((data ?? []) as ChatConversation[])
  }, [supabase])
  ```
- [ ] Read `src/lib/chat/notify.ts` first, change:
  ```typescript
  const { data: conv } = await service
    .from('chat_conversations')
    .select('type, title')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return
  ```
  to:
  ```typescript
  const { data: conv } = await service
    .from('chat_conversations')
    .select('type, title, session_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return
  ```
  Then, after the existing `const title = ...` block and before the `const { data: participants }`
  line, insert:
  ```typescript
  let url = `/dashboard/chat?c=${conversationId}`
  if (conv.type === 'session' && conv.session_id) {
    const { data: session } = await service
      .from('sessions').select('client_id').eq('id', conv.session_id).maybeSingle()
    if (session?.client_id) url = `/dashboard/clients/${session.client_id}/sessions/${conv.session_id}`
  }
  ```
  Then change the `sendPushToUser` call's `url:` field from `` url: `/dashboard/chat?c=${conversationId}`, `` to `url,`.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/chat/ChatRealtimeProvider.tsx src/lib/chat/notify.ts && git commit -m "feat: room chat + client delivery — exclude session chats from Team Chat inbox, fix notification link"`

---

## C-10 — "Call Chat" review section on the session detail page

*Codex edits:*
- [ ] Create `src/components/clients/SessionCallChat.tsx`:
  ```typescript
  'use client'

  import { useEffect, useMemo, useState } from 'react'
  import { ChevronDown } from 'lucide-react'
  import { createClient } from '@/lib/supabase-browser'
  import AttachmentChip from '@/components/chat/AttachmentChip'
  import type { ChatMessage } from '@/lib/chat/types'

  const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
  }

  export default function SessionCallChat({ conversationId }: { conversationId: string }) {
    const [show, setShow] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [names, setNames] = useState<Record<string, string>>({})
    const [loaded, setLoaded] = useState(false)
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
      if (!show || loaded) return
      ;(async () => {
        const [{ data: msgs }, { data: participants }] = await Promise.all([
          supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(200),
          supabase
            .from('chat_participants')
            .select('user_id, profiles(full_name, email)')
            .eq('conversation_id', conversationId),
        ])
        setMessages((msgs ?? []) as unknown as ChatMessage[])
        const map: Record<string, string> = {}
        for (const row of (participants ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[]) {
          map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'Unknown'
        }
        setNames(map)
        setLoaded(true)
      })()
    }, [show, loaded, conversationId, supabase])

    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400"
        >
          <ChevronDown size={14} className={`transition-transform ${show ? '' : '-rotate-90'}`} />
          Call Chat
        </button>
        {show && (
          <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">No messages yet.</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className="text-sm">
                  <span className="font-semibold text-gray-700 dark:text-slate-300">{names[m.sender_id] ?? 'Unknown'}</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{fmtTime(m.created_at)}</span>
                  <p className="mt-0.5 text-gray-600 dark:text-slate-400">{m.deleted_at ? 'message removed' : m.body}</p>
                  {!m.deleted_at && m.chat_attachments?.map(a => <AttachmentChip key={a.id} attachment={a} />)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    )
  }
  ```
- [ ] Read `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` first. After the
  existing `let call: ...` block, add:
  ```typescript
  let sessionChatConversationId: string | null = null
  const { data: chatConv } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('session_id', sessionId)
    .eq('type', 'session')
    .maybeSingle()
  if (chatConv) sessionChatConversationId = chatConv.id
  ```
  Add `sessionChatConversationId={sessionChatConversationId}` to the `<SessionDetailClient
  ... />` render, alongside the existing `call={call}` prop.
- [ ] Read `src/components/clients/SessionDetailClient.tsx` first. Add the import:
  ```typescript
  import SessionCallChat from '@/components/clients/SessionCallChat'
  ```
  Add `sessionChatConversationId: string | null` to the destructured props and the type
  signature, alongside the existing `call`:
  ```typescript
    call,
    sessionChatConversationId,
  }: {
    session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
    todos: Todo[]
    clientId: string
    clientName: string
    clientEmail: string | null
    orgId: string | null
    linkedProgram: LinkedProgramBundle | null
    series: SessionSeriesInfo | null
    call: { id: string; startsAt: string; summary: string | null } | null
    sessionChatConversationId: string | null
  }) {
  ```
  In the `lg:col-span-2 space-y-4` column, after the existing Notes section's closing `</div>`
  (the one that closes the `space-y-2` block containing the Notes `ChevronDown` button and
  textarea) and before that column's own closing `</div>`, add:
  ```typescript
              {sessionChatConversationId && (
                <SessionCallChat conversationId={sessionChatConversationId} />
              )}
  ```

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/clients/SessionCallChat.tsx "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx && git commit -m "feat: room chat + client delivery — Call Chat section on session detail page"`

---

## C-11 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner) — this feature touches live auth, so this pass
  matters more than usual:
  1. Open a session with a linked program, ensure the client has an email on file,
     schedule/join its video call as staff. Confirm Notes / Program / Chat buttons all appear,
     each opening the same panel on their own tab; clicking the active tab's button again closes
     the panel.
  2. Send a message from staff in the Chat tab — confirm it appears immediately.
  3. Join the same call as the guest via its `/join/[guestToken]` link. Confirm the guest's call
     window shows ONLY a Chat button (no Notes/Program) and only a Chat tab is ever reachable.
  4. Send a message from the guest — confirm it appears live in staff's Chat tab (and vice
     versa).
  5. Attach a file directly through the chat composer (either side) — confirm it uploads and
     appears as a downloadable/previewable attachment for both participants.
  6. In the Program tab (staff only), click "Share to chat" on a file, a link-type asset, and a
     note. Confirm each posts a message into the Chat tab with the right content.
  7. End the call. Reopen the session detail page — confirm a "Call Chat" section appears,
     collapsed by default, and expanding it shows the full message history (including shared
     assets) read-only, with no input box.
  8. Confirm this conversation does NOT appear anywhere in the normal Team Chat inbox for the
     staff member who was in the call.
  9. Re-join the SAME session's call a second time (e.g. schedule a follow-up call for the same
     session, or rejoin) as the same client guest — confirm they're recognised as the same
     person (no duplicate guest account created) and can see the same chat history.
  10. Try scheduling a video call for a session whose client has no email on file — confirm this
     is blocked with the existing "add an email first" message (unchanged from before this
     feature), and confirm no chat-related errors appear anywhere.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: migrations applied, verified via `execute_sql`, committed
- [x] C-2: `session-chat.ts` compiles clean, all three helpers match the design
- [x] C-3: `CallPanel` compiles clean, matches the approved tabbed-shell design
- [x] C-4: `ProgramReferencePanel` is content-only (no own header/wrapper), share-to-chat works
- [x] C-5: `RoomChatTab` compiles clean, reuses `MessageComposer`/`AttachmentChip` as designed
- [x] C-6: `CallRoom` renders the unified panel, all three tabs wire up correctly, guests never
  receive `linkedProgram`
- [x] C-7: staff chat participancy ensured on the call page
- [ ] C-8: guest identity/sign-in flow works end to end, never blocks video join on failure
- [ ] C-9: session-type conversations excluded from Team Chat inbox, notification links to the
  session page
- [ ] C-10: "Call Chat" section appears on the session page when a conversation exists
- [ ] C-11: full manual smoke test passes, including the guest-isolation and repeat-visit checks

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-11 (no test runner in this project) — this feature touches live Supabase
Auth (admin-created users, magic-link sign-in), so the manual pass is the only real verification
that guest identity actually works end to end.
