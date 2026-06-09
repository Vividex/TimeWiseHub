// src/components/AssistantWidget.tsx
'use client'

import { FormEvent, useRef, useState } from 'react'
import { Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'
import { useVoice } from '@/hooks/useVoice'

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  action?: ActionProposal
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

type View = 'chat' | 'report' | 'reported'

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

export default function AssistantWidget({
  userEmail,
  open,
  onClose,
}: {
  userEmail: string
  open: boolean
  onClose: () => void
}) {
  const [view, setView] = useState<View>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I can read your tasks, projects, expenses, time entries, and more — and help you create or update them. What would you like to do?",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [bugDescription, setBugDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const voiceTextRef = useRef('')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const { state: voiceState, supported: voiceSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
    onTranscript: (text) => {
      voiceTextRef.current = text
      setInput(text)
      setTimeout(() => formRef.current?.requestSubmit(), 0)
    },
    enabled: voiceEnabled,
  })

  function buildHistory(msgs: Message[]) {
    const filtered = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }))
      .filter(m => m.content.trim().length > 0)
    // Anthropic requires the first message to be from the user
    const firstUser = filtered.findIndex(m => m.role === 'user')
    return firstUser === -1 ? [] : filtered.slice(firstUser)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = (voiceTextRef.current || input).trim()
    voiceTextRef.current = ''
    if (!text || loading) return

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
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

      if (action) {
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = {
            role: 'assistant',
            content: finalText,
            action,
            actionStatus: 'pending',
          }
          return u
        })
      } else {
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: finalText }
          return u
        })
      }
      if (voiceEnabled && finalText) speak(finalText)
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

      const confirmedMsg: Message = { ...msg, actionStatus: 'confirmed' as const }
      const followUp = res.ok
        ? `Action confirmed and completed. Result: ${JSON.stringify(data.result)}`
        : `The action failed with error: ${data.error}`

      const notice: Message = {
        role: 'notice',
        content: res.ok ? `Action confirmed.` : `Action failed: ${data.error}`,
      }

      const nextMessages: Message[] = [
        ...messages.slice(0, msgIndex),
        confirmedMsg,
        notice,
        { role: 'assistant', content: '' },
      ]
      setMessages(nextMessages)
      setLoading(true)

      const historyWithFollowUp = [
        ...buildHistory(messages.slice(0, msgIndex + 1)),
        { role: 'user' as const, content: followUp },
      ]

      const abort = new AbortController()
      abortRef.current = abort
      const apiRes = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyWithFollowUp }),
        signal: abort.signal,
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
      abortRef.current = null
    }
  }

  function handleCancel(msgIndex: number) {
    setMessages(cur => {
      const u = [...cur]
      u[msgIndex] = { ...u[msgIndex], actionStatus: 'cancelled' }
      return u
    })
  }

  async function handleBugReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const description = bugDescription.trim()
    if (!description || submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, conversation: messages }),
      })
      setView('reported')
    } catch {
      setView('reported')
    } finally {
      setSubmitting(false)
    }
  }

  const mailtoLink = `mailto:support@vividex.au?subject=${encodeURIComponent('Bug Report — TimeWiseHub')}&body=${encodeURIComponent(`User: ${userEmail}\n\nDescription:\n${bugDescription}`)}`

  if (!open) return null

  return (
    <div className="mb-1 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white dark:border-slate-700">
        <div>
          <h2 className="text-base font-black">
            {view === 'chat' ? 'AI Assistant' : view === 'report' ? 'Report a bug' : 'Report sent'}
          </h2>
          <p className="text-xs font-medium text-slate-400">
            {view === 'chat' ? 'Ask anything or take action.' : view === 'report' ? "Describe what went wrong and we'll look into it." : 'Our team has been notified.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/assistant"
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Full view →
          </a>
          <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
            ✕
          </button>
        </div>
      </div>

      {view === 'chat' && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 dark:bg-slate-950">
            {messages.map((msg, i) => {
              if (msg.role === 'notice') {
                return (
                  <p key={i} className="text-center text-xs font-medium text-gray-400 dark:text-slate-500">
                    {msg.content}
                  </p>
                )
              }
              return (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
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
          </div>

          <div className="border-t border-gray-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setView('report')}
              className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600"
            >
              Report a bug →
            </button>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} data-assistant-form className="border-t border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                }}
                rows={2}
                placeholder="Ask the assistant…"
                className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={() => { setVoiceEnabled(v => !v); stopSpeaking() }}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    voiceEnabled
                      ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                  title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
                >
                  {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              )}
              {voiceSupported && voiceEnabled && (
                <button
                  type="button"
                  onMouseDown={startListening}
                  onMouseUp={stopListening}
                  onTouchStart={startListening}
                  onTouchEnd={stopListening}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    voiceState === 'listening'
                      ? 'animate-pulse bg-red-500 text-white'
                      : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                  title="Hold to speak"
                >
                  {voiceState === 'listening' ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {view === 'report' && (
        <form onSubmit={handleBugReport} className="flex flex-1 flex-col gap-4 p-5">
          <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
            Tell us what went wrong. We&apos;ll follow up at <span className="font-bold text-slate-900 dark:text-slate-100">{userEmail}</span>.
          </p>
          <textarea
            value={bugDescription}
            onChange={e => setBugDescription(e.target.value)}
            rows={6}
            placeholder="e.g. I clicked Submit expense and nothing happened."
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            required
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setView('chat')} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Back</button>
            <button type="submit" disabled={submitting || !bugDescription.trim()} className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50">{submitting ? 'Sending…' : 'Send report'}</button>
          </div>
        </form>
      )}

      {view === 'reported' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl dark:bg-green-950">✓</div>
          <div>
            <p className="text-base font-black text-slate-900 dark:text-slate-100">Report received</p>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">We&apos;ll follow up at <span className="font-semibold text-slate-900 dark:text-slate-100">{userEmail}</span>.</p>
          </div>
          <p className="text-xs font-medium text-gray-400">
            For urgent issues email <a href={mailtoLink} className="font-semibold text-cyan-600 hover:underline">support@vividex.au</a>
          </p>
          <button onClick={() => { setView('chat'); setBugDescription('') }} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors dark:bg-slate-700">
            Back to assistant
          </button>
        </div>
      )}
    </div>
  )
}
