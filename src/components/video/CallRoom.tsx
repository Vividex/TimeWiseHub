'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DailyIframe from '@daily-co/daily-js'
import { NotebookPen, X } from 'lucide-react'

type TranscriptLine = { speaker: string; text: string; ts: string }

type Props = {
  roomUrl: string
  token: string
  dailyRoomName: string
  isCreator: boolean
  callId?: string
}

export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator, callId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
  const chunkBufferRef = useRef<string>('')
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const [noteState, setNoteState] = useState<'idle' | 'active' | 'stopped'>('idle')
  const [panelOpen, setPanelOpen] = useState(false)
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([])

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
      const participants = frame.participants() as Record<string, { user_name?: string }> | null
      const speaker = participants?.[evt?.participantId]?.user_name ?? 'Unknown'
      const text = evt?.text ?? ''
      const ts = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
      const line: TranscriptLine = { speaker, text, ts }
      setTranscriptLines(prev => [...prev, line])
      chunkBufferRef.current += `\n[${speaker}]: ${text}`
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
    frameRef.current?.startTranscription()
    setNoteState('active')
    setPanelOpen(true)
    flushIntervalRef.current = setInterval(flushBuffer, 30000)
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

      {/* Controls bar */}
      <div
        className="flex shrink-0 items-center justify-center gap-3 bg-slate-900 px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Notes button */}
        <button
          onClick={noteState === 'idle' ? startNotes : () => setPanelOpen(p => !p)}
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
