// src/components/assistant/AssistantPageClient.tsx
'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Send, Plus, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'
import { useVoice } from '@/hooks/useVoice'

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  action?: ActionProposal
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

type Session = { id: string; title: string | null; updated_at: string }

const ACTION_SENTINEL = '\n__ACTION__:'

function parseResponse(raw: string): { text: string; action: ActionProposal | null } {
  const idx = raw.indexOf(ACTION_SENTINEL)
  if (idx === -1) return { text: raw, action: null }
  const text = raw.slice(0, idx)
  try {
    const action = JSON.parse(raw.slice(idx + ACTION_SENTINEL.length)) as ActionProposal
    return { text, action }
  } catch {
    return { text: raw, action: null }
  }
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
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const { state: voiceState, supported: voiceSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
    onTranscript: (text) => {
      setInput(text)
    },
    enabled: voiceEnabled,
  })

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
    await supabase
      .from('assistant_sessions')
      .update({ messages: msgs, ...(title ? { title } : {}) })
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

  function buildHistory(msgs: Message[]) {
    const filtered = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }))
      .filter(m => m.content.trim())
    // Anthropic requires the first message to be from the user
    const firstUser = filtered.findIndex(m => m.role === 'user')
    return firstUser === -1 ? [] : filtered.slice(firstUser)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createNewSession()
      setActiveSessionId(sessionId)
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }]
    const withPlaceholder: Message[] = [...nextMessages, { role: 'assistant', content: '' }]
    setMessages(withPlaceholder)
    setInput('')
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
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: accumulated }
          return u
        })
      }

      const { text: finalText, action } = parseResponse(accumulated)
      const finalMessages: Message[] = [
        ...nextMessages,
        action
          ? { role: 'assistant', content: finalText, action, actionStatus: 'pending' as const }
          : { role: 'assistant', content: finalText },
      ]
      setMessages(finalMessages)
      if (voiceEnabled && finalText) speak(finalText)

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
    if (!msg.action) return
    setConfirmingId(msg.action.id)

    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: msg.action.tool, input: msg.action.input }),
      })
      const data = await res.json()

      setMessages(cur => {
        const u = [...cur]
        u[msgIndex] = { ...u[msgIndex], actionStatus: 'confirmed' }
        return u
      })

      const followUp = res.ok
        ? `Action confirmed and completed. Result: ${JSON.stringify(data.result)}`
        : `The action failed: ${data.error}`

      const historyWithFollowUp = [
        ...buildHistory(messages.slice(0, msgIndex + 1)),
        { role: 'user' as const, content: followUp },
      ]

      const notice: Message = { role: 'notice', content: res.ok ? 'Action confirmed.' : `Failed: ${data.error}` }
      setMessages(cur => [...cur, notice, { role: 'assistant', content: '' }])
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
          setMessages(cur => {
            const u = [...cur]
            u[u.length - 1] = { role: 'assistant', content: acc }
            return u
          })
        }
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
      {/* Sidebar */}
      <div className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0 bg-gray-50 dark:bg-slate-950">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
              <p className="text-lg font-black text-slate-900 dark:text-slate-100">What can I help with?</p>
              <p className="mt-2 text-sm">Ask about your tasks, projects, time, expenses, or anything else.</p>
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
                  <p className="whitespace-pre-wrap">
                    {msg.content || (loading && i === messages.length - 1 ? 'Thinking…' : '')}
                  </p>
                  {msg.action && msg.actionStatus === 'pending' && (
                    <ActionCard
                      proposal={msg.action}
                      onConfirm={() => handleConfirm(i)}
                      onCancel={() => handleCancel(i)}
                      loading={confirmingId === msg.action.id}
                    />
                  )}
                  {msg.action && msg.actionStatus === 'confirmed' && (
                    <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">✓ Confirmed</p>
                  )}
                  {msg.action && msg.actionStatus === 'cancelled' && (
                    <p className="mt-2 text-xs font-semibold text-gray-400">Cancelled</p>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit} data-assistant-form>
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                }}
                rows={2}
                placeholder="Ask the assistant…"
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                <Send size={18} />
              </button>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={() => { setVoiceEnabled(v => !v); stopSpeaking() }}
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
              {voiceSupported && voiceEnabled && (
                <button
                  type="button"
                  onMouseDown={startListening}
                  onMouseUp={stopListening}
                  onTouchStart={startListening}
                  onTouchEnd={stopListening}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    voiceState === 'listening'
                      ? 'animate-pulse bg-red-500 text-white'
                      : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                  title="Hold to speak"
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
