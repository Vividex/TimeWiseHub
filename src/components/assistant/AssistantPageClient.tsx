// src/components/assistant/AssistantPageClient.tsx
'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Send, Plus, Mic, MicOff, Volume2, VolumeX, Repeat, X, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'
import { useVoice } from '@/hooks/useVoice'
import { resizeImageToBase64 } from '@/lib/imageUtils'

type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type TextBlock = { type: 'text'; text: string }
type ContentBlock = ImageBlock | TextBlock

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  images?: string[]           // base64 data URLs — in-memory only, stripped before DB save
  actions?: ActionProposal[]  // current: array of proposals
  action?: ActionProposal     // legacy: single proposal from old saved sessions
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

function getActions(msg: Message): ActionProposal[] {
  if (msg.actions && msg.actions.length > 0) return msg.actions
  if (msg.action) return [msg.action]
  return []
}

type Session = { id: string; title: string | null; updated_at: string }

const ACTION_SENTINEL = '\n__ACTION__:'

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function parseResponse(raw: string): { text: string; actions: ActionProposal[] } {
  const parts = raw.split(ACTION_SENTINEL)
  const text = parts[0]
  if (parts.length === 1) return { text, actions: [] }
  const actions: ActionProposal[] = []
  for (let i = 1; i < parts.length; i++) {
    try { actions.push(JSON.parse(parts[i]) as ActionProposal) } catch { /* skip malformed */ }
  }
  return { text, actions }
}

export default function AssistantPageClient({
  userId,
  userEmail: _userEmail,
  initialSessions,
}: {
  userId: string
  userEmail: string
  initialSessions: Session[]
}) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const voiceTextRef = useRef('')
  const supabase = createClient()
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [loopMode, setLoopMode] = useState(false)
  const loopModeRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const SIGN_OFFS = ['thanks', 'thank you', 'cheers', 'that will do', 'done', 'goodbye', 'bye']

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
  }, [])

  const { state: voiceState, supported: voiceSupported, ttsSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
    onTranscript: (text) => {
      clearSilenceTimer()
      voiceTextRef.current = text
      setInput(text)
      const lower = text.toLowerCase()
      if (SIGN_OFFS.some(w => lower.includes(w))) {
        loopModeRef.current = false
        setLoopMode(false)
      }
      setTimeout(() => formRef.current?.requestSubmit(), 0)
    },
    enabled: voiceEnabled,
    onSpeakEnd: () => {
      if (!loopModeRef.current) return
      silenceTimerRef.current = setTimeout(() => {
        loopModeRef.current = false
        setLoopMode(false)
      }, 15000)
      // Yield one tick so the browser releases the audio context before
      // SpeechRecognition tries to claim the mic; without this, start()
      // can throw InvalidStateError and the loop dies silently.
      setTimeout(() => { if (loopModeRef.current) startListening() }, 300)
    },
  })

  function toggleLoopMode() {
    const next = !loopMode
    setLoopMode(next)
    loopModeRef.current = next
    if (next) {
      setVoiceEnabled(true)
      silenceTimerRef.current = setTimeout(() => {
        loopModeRef.current = false
        setLoopMode(false)
      }, 15000)
      startListening()
    } else {
      clearSilenceTimer()
      stopListening()
      stopSpeaking()
    }
  }

  // Auto-load the most recent session so the AI picks up where it left off.
  useEffect(() => {
    if (initialSessions.length > 0) loadSession(initialSessions[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadSession(id: string) {
    const { data } = await supabase
      .from('assistant_sessions')
      .select('messages')
      .eq('id', id)
      .single()
    setActiveSessionId(id)
    setMessages((data?.messages as Message[]) ?? [])
  }

  async function saveSession(id: string, msgs: Message[], title?: string) {
    // Strip base64 images before persisting — they're large and display-only
    const serializable = msgs.map(m => m.images ? { ...m, images: undefined } : m)
    await supabase
      .from('assistant_sessions')
      .update({ messages: serializable, ...(title ? { title } : {}) })
      .eq('id', id)
  }

  async function createNewSession(): Promise<string> {
    const { data } = await supabase
      .from('assistant_sessions')
      .insert({ user_id: userId, title: 'New conversation', messages: [] })
      .select('id, title, updated_at')
      .single()
    if (data) {
      setSessions(prev => [data as Session, ...prev])
      return data.id
    }
    return ''
  }

  function buildHistory(msgs: Message[]): Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> {
    const filtered = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        if (m.role === 'user' && m.images && m.images.length > 0) {
          const blocks: ContentBlock[] = [
            ...m.images.map((dataUrl): ImageBlock => {
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
              return {
                type: 'image',
                source: { type: 'base64', media_type: match?.[1] ?? 'image/jpeg', data: match?.[2] ?? dataUrl.split(',')[1] },
              }
            }),
            { type: 'text', text: m.content || '' },
          ]
          return { role: 'user' as const, content: blocks }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content || '' }
      })
      .filter(m => {
        const c = m.content
        if (typeof c === 'string') return c.trim().length > 0
        return c.length > 0
      })
    // Anthropic requires the first message to be from the user
    const firstUser = filtered.findIndex(m => m.role === 'user')
    return firstUser === -1 ? [] : filtered.slice(firstUser)
  }

  async function processImageFiles(fileList: FileList | File[]) {
    const images = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return
    const bases = await Promise.all(images.map(f => resizeImageToBase64(f)))
    setPendingImages(prev => [...prev, ...bases])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = (voiceTextRef.current || input).trim()
    voiceTextRef.current = ''
    if ((!text && pendingImages.length === 0) || loading) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createNewSession()
      setActiveSessionId(sessionId)
    }

    const userMsg: Message = {
      role: 'user',
      content: text,
      ...(pendingImages.length > 0 ? { images: [...pendingImages] } : {}),
    }
    const nextMessages: Message[] = [...messages, userMsg]
    const withPlaceholder: Message[] = [...nextMessages, { role: 'assistant', content: '' }]
    setMessages(withPlaceholder)
    setInput('')
    setPendingImages([])
    setLoading(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildHistory(nextMessages) }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Assistant unavailable.')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        // Strip the sentinel and everything after it from the live display —
        // parseResponse handles the final split after streaming ends.
        const sentinelIdx = accumulated.indexOf(ACTION_SENTINEL)
        const displayText = sentinelIdx === -1 ? accumulated : accumulated.slice(0, sentinelIdx)
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: displayText }
          return u
        })
      }

      const { text: finalText, actions } = parseResponse(accumulated)
      const finalMessages: Message[] = [
        ...nextMessages,
        actions.length > 0
          ? { role: 'assistant', content: finalText, actions, actionStatus: 'pending' as const }
          : { role: 'assistant', content: finalText },
      ]
      setMessages(finalMessages)
      if (voiceEnabled && finalText) speak(stripMarkdown(finalText))

      const isFirst = messages.length === 0
      const title = isFirst ? text.slice(0, 60) : undefined
      if (sessionId) await saveSession(sessionId, finalMessages, title)
      if (isFirst && title) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Assistant unavailable.'
      setMessages(cur => {
        const u = [...cur]
        u[u.length - 1] = { role: 'assistant', content: msg }
        return u
      })
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  async function handleConfirm(msgIndex: number) {
    const msg = messages[msgIndex]
    const actions = getActions(msg)
    if (actions.length === 0) return
    setConfirmingId(actions[0].id)

    try {
      // Same-tool batches run sequentially to preserve insertion order (e.g. 9 create_task).
      // Mixed-tool batches run in parallel since ordering is irrelevant.
      const allSameTool = actions.every(a => a.tool === actions[0].tool)
      type ExecResult = { ok?: boolean; result?: unknown; error?: string }
      let results: PromiseSettledResult<ExecResult>[]
      if (allSameTool && actions.length > 1) {
        const settled: PromiseSettledResult<ExecResult>[] = []
        for (const action of actions) {
          try {
            const data = await fetch('/api/assistant/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: action.tool, input: action.input }),
            }).then(r => r.json() as Promise<ExecResult>)
            settled.push({ status: 'fulfilled', value: data })
          } catch (e) {
            settled.push({ status: 'rejected', reason: e })
          }
        }
        results = settled
      } else {
        results = await Promise.allSettled(
          actions.map(action =>
            fetch('/api/assistant/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: action.tool, input: action.input }),
            }).then(r => r.json() as Promise<ExecResult>)
          )
        )
      }

      const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.ok))
      const allOk = failures.length === 0
      const confirmedMsg: Message = { ...msg, actionStatus: 'confirmed' as const }

      const followUp = allOk
        ? `${actions.length} action${actions.length > 1 ? 's' : ''} confirmed and completed. Results: ${JSON.stringify(results.map(r => r.status === 'fulfilled' ? r.value?.result : null))}`
        : `${actions.length - failures.length} of ${actions.length} actions succeeded. Failures: ${JSON.stringify(failures)}`

      const historyWithFollowUp: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = [
        ...buildHistory([...messages.slice(0, msgIndex), confirmedMsg]),
        { role: 'user' as const, content: followUp },
      ]

      const notice: Message = {
        role: 'notice',
        content: allOk
          ? (actions.length > 1 ? `${actions.length} actions confirmed.` : 'Action confirmed.')
          : `${failures.length} action${failures.length > 1 ? 's' : ''} failed.`,
      }
      const nextMessages: Message[] = [
        ...messages.slice(0, msgIndex),
        confirmedMsg,
        notice,
        { role: 'assistant', content: '' },
      ]
      setMessages(nextMessages)
      setLoading(true)

      const apiRes = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyWithFollowUp }),
      })

      if (apiRes.ok && apiRes.body) {
        const reader = apiRes.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          const sentinelIdx = acc.indexOf(ACTION_SENTINEL)
          const displayText = sentinelIdx === -1 ? acc : acc.slice(0, sentinelIdx)
          setMessages(cur => {
            const u = [...cur]
            u[u.length - 1] = { role: 'assistant', content: displayText }
            return u
          })
        }
        const { text: followUpText, actions: followUpActions } = parseResponse(acc)
        if (voiceEnabled && followUpText) speak(stripMarkdown(followUpText))
        const followUpMsg: Message = followUpActions.length > 0
          ? { role: 'assistant', content: followUpText, actions: followUpActions, actionStatus: 'pending' as const }
          : { role: 'assistant', content: followUpText }
        const finalMessages: Message[] = [
          ...messages.slice(0, msgIndex),
          confirmedMsg,
          notice,
          followUpMsg,
        ]
        setMessages(finalMessages)
        if (activeSessionId) await saveSession(activeSessionId, finalMessages)
      }
    } finally {
      setConfirmingId(null)
      setLoading(false)
    }
  }

  function handleCancel(msgIndex: number) {
    setMessages(cur => {
      const u = [...cur]
      u[msgIndex] = { ...u[msgIndex], actionStatus: 'cancelled' }
      return u
    })
  }

  return (
    <div className="flex h-full w-full">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Conversations</h2>
          <button
            onClick={async () => {
              setMessages([])
              setActiveSessionId(null)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-white transition-colors hover:bg-cyan-600"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                s.id === activeSessionId
                  ? 'bg-cyan-50 font-semibold text-cyan-700 dark:bg-slate-800 dark:text-cyan-400'
                  : 'text-slate-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="block truncate">{s.title ?? 'Untitled'}</span>
              <span className="text-xs text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">No conversations yet.</p>
          )}
        </div>
      </div>

      {/* Mobile history overlay */}
      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileHistoryOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Conversations</h2>
              <button
                onClick={() => setMobileHistoryOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => { loadSession(s.id); setMobileHistoryOpen(false) }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    s.id === activeSessionId
                      ? 'bg-cyan-50 font-semibold text-cyan-700 dark:bg-slate-800 dark:text-cyan-400'
                      : 'text-slate-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="block truncate">{s.title ?? 'Untitled'}</span>
                  <span className="text-xs text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</span>
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No conversations yet.</p>
              )}
            </div>
            <div className="border-t border-gray-100 p-3 dark:border-slate-800">
              <button
                onClick={() => { setMessages([]); setActiveSessionId(null); setMobileHistoryOpen(false) }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cyan-600"
              >
                <Plus size={16} /> New conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0 bg-gray-50 dark:bg-slate-950">
        {/* Mobile top bar — shows current session title + history/new buttons */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 md:hidden dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setMobileHistoryOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Conversation history"
          >
            <MessageSquare size={18} />
          </button>
          <span className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {sessions.find(s => s.id === activeSessionId)?.title ?? 'New conversation'}
          </span>
          <button
            onClick={() => { setMessages([]); setActiveSessionId(null) }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-white transition-colors hover:bg-cyan-600"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
              <p className="text-lg font-black text-slate-900 dark:text-slate-100">What can I help with?</p>
              <p className="mt-2 text-sm">Ask about your tasks, projects, time, expenses, or anything else.</p>
              <p className="mt-1 text-xs text-gray-400">You can also paste or drag-and-drop images.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            if (msg.role === 'notice') {
              return <p key={i} className="text-center text-xs font-medium text-gray-400">{msg.content}</p>
            }
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl rounded-2xl px-5 py-4 text-sm leading-6 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-cyan-500 text-white'
                    : 'border border-gray-100 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                }`}>
                  {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {msg.images.map((src, j) => (
                        <img key={j} src={src} alt="" className="max-h-48 max-w-xs rounded-xl object-contain" />
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">
                    {msg.content || (loading && i === messages.length - 1 ? 'Thinking…' : '')}
                  </p>
                  {(() => {
                    const msgActions = getActions(msg)
                    if (msgActions.length === 0) return null
                    return (
                      <>
                        {msg.actionStatus === 'pending' && (
                          <ActionCard
                            proposals={msgActions}
                            onConfirm={() => handleConfirm(i)}
                            onCancel={() => handleCancel(i)}
                            loading={confirmingId === msgActions[0].id}
                          />
                        )}
                        {msg.actionStatus === 'confirmed' && (
                          <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">✓ Confirmed</p>
                        )}
                        {msg.actionStatus === 'cancelled' && (
                          <p className="mt-2 text-xs font-semibold text-gray-400">Cancelled</p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div
          className="relative border-t border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
          }}
          onDrop={async e => {
            e.preventDefault()
            setIsDragging(false)
            await processImageFiles(e.dataTransfer.files)
          }}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-cyan-400 bg-cyan-50/90 dark:bg-slate-800/90">
              <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">Drop image to attach</p>
            </div>
          )}
          {pendingImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingImages.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="h-16 w-16 rounded-lg border border-gray-200 object-cover dark:border-slate-700" />
                  <button
                    type="button"
                    onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white shadow"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form ref={formRef} onSubmit={handleSubmit} data-assistant-form>
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                }}
                onPaste={async e => {
                  const items = Array.from(e.clipboardData.items)
                  const imgItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'))
                  if (imgItems.length === 0) return
                  e.preventDefault()
                  const files = imgItems.map(i => i.getAsFile()).filter((f): f is File => f !== null)
                  await processImageFiles(files)
                }}
                rows={2}
                placeholder="Ask the assistant… or paste / drop an image"
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && pendingImages.length === 0)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                <Send size={18} />
              </button>
              {ttsSupported && (
                <button
                  type="button"
                  onClick={() => { setVoiceEnabled(v => !v); stopSpeaking(); if (loopMode) { loopModeRef.current = false; setLoopMode(false); clearSilenceTimer() } }}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    voiceEnabled
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                  title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
                >
                  {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              )}
              {ttsSupported && voiceSupported && (
                <button
                  type="button"
                  onClick={toggleLoopMode}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    loopMode
                      ? 'animate-pulse bg-cyan-500 text-white'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                  title={loopMode ? 'Stop conversation loop' : 'Start conversation loop'}
                >
                  <Repeat size={18} />
                </button>
              )}
              {voiceSupported && voiceEnabled && (
                <button
                  type="button"
                  onClick={() => voiceState === 'listening' ? stopListening() : startListening()}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    voiceState === 'listening'
                      ? 'animate-pulse bg-red-500 text-white'
                      : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                  title={voiceState === 'listening' ? 'Tap to stop' : 'Tap to speak'}
                >
                  {voiceState === 'listening' ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
