'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DailyIframe from '@daily-co/daily-js'
import { NotebookPen, BookOpen, MessageCircle } from 'lucide-react'
import CallPanel, { type CallPanelTabId } from './CallPanel'
import ProgramReferencePanel from '@/components/video/ProgramReferencePanel'
import RoomChatTab from './RoomChatTab'
import WorksheetTab, { type LinkedTopicAsset } from './WorksheetTab'
import { createClient } from '@/lib/supabase-browser'
import type { LinkedProgramBundle } from '@/types/programs'

type TranscriptLine = { speaker: string; text: string; ts: string }

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

export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, isGuest = false, callId, linkedProgram, sessionChat, linkedTopicAssets, sessionStudentId, currentUserId }: Props) {
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

  const canUseWorksheet = !!callId && !!currentUserId && ((linkedTopicAssets && linkedTopicAssets.length > 0) || isGuest)

  const availableTabs: CallPanelTabId[] = [
    'transcript',
    ...(linkedProgram ? (['program'] as const) : []),
    ...(sessionChat ? (['chat'] as const) : []),
    ...(canUseWorksheet ? (['worksheet'] as const) : []),
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
      if (isGuest) {
        await createClient().auth.signOut()
        router.push('/call-ended')
      } else {
        router.push('/dashboard/video')
      }
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
    <div
      className="relative flex flex-col bg-slate-950"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
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
        {activeTab === 'worksheet' && canUseWorksheet && (
          <WorksheetTab
            callId={callId!}
            assets={linkedTopicAssets ?? []}
            studentId={sessionStudentId ?? null}
            currentUserId={currentUserId!}
            canPick={!isGuest}
          />
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
