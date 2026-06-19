// src/components/AssistantWidget.tsx
'use client'

import { FormEvent, useRef, useState } from 'react'
import { Send, Mic, MicOff, Volume2, VolumeX, GripVertical } from 'lucide-react'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'
import { useVoice } from '@/hooks/useVoice'

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  actions?: ActionProposal[]   // current: array of proposals
  action?: ActionProposal      // legacy: single proposal from old saved sessions
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

function getActions(msg: Message): ActionProposal[] {
  if (msg.actions && msg.actions.length > 0) return msg.actions
  if (msg.action) return [msg.action]
  return []
}

type View = 'chat' | 'report' | 'reported'

const ACTION_SENTINEL = '\n__ACTION__:'

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

export default function AssistantWidget({
  userEmail,
  open,
  onClose,
  onHeaderPointerDown,
}: {
  userEmail: string
  open: boolean
  onClose: () => void
  onHeaderPointerDown?: (e: React.PointerEvent) => void
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
  const { state: voiceState, supported: voiceSupported, ttsSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
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
        const sentinelIdx = accumulated.indexOf(ACTION_SENTINEL)
        const displayText = sentinelIdx === -1 ? accumulated : accumulated.slice(0, sentinelIdx)
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: displayText }
          return u
        })
      }

      const { text: finalText, actions } = parseResponse(accumulated)
      setMessages(cur => {
        const u = [...cur]
        u[u.length - 1] = actions.length > 0
          ? { role: 'assistant', content: finalText, actions, actionStatus: 'pending' }
          : { role: 'assistant', content: finalText }
        return u
      })
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
    const actions = getActions(msg)
    if (actions.length === 0) return
    setConfirmingId(actions[0].id)

    try {
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
        : `${actions.length - failures.length} of ${actions.length} actions succeeded.`

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

      const historyWithFollowUp = [
        ...buildHistory([...messages.slice(0, msgIndex), confirmedMsg]),
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
          const sentinelIdx = acc.indexOf(ACTION_SENTINEL)
          const displayText = sentinelIdx === -1 ? acc : acc.slice(0, sentinelIdx)
          setMessages(cur => {
            const u = [...cur]
            u[u.length - 1] = { role: 'assistant', content: displayText }
            return u
          })
        }
        const { text: followUpText, actions: followUpActions } = parseResponse(acc)
        if (voiceEnabled && followUpText) speak(followUpText)
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = followUpActions.length > 0
            ? { role: 'assistant', content: followUpText, actions: followUpActions, actionStatus: 'pending' }
            : { role: 'assistant', content: followUpText }
          return u
        })
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

  const CHIPS = [
    'Summarise this week',
    'Check outstanding invoices',
    'What tasks are overdue?',
    'Log time for today',
    'Show active projects',
  ]

  return (
    <div className="flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 text-white backdrop-blur select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical size={14} className="shrink-0 text-slate-600" aria-hidden />
          <div>
            <h2 className="text-base font-black">
              {view === 'chat' ? 'AI Assistant' : view === 'report' ? 'Report a bug' : 'Report sent'}
            </h2>
            <p className="text-xs font-medium text-slate-400">
              {view === 'chat' ? 'Ask anything or take action.' : view === 'report' ? "Describe what went wrong and we'll look into it." : 'Our team has been notified.'}
            </p>
          </div>
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
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-950 p-4">
            {messages.map((msg, i) => {
              if (msg.role === 'notice') {
                return (
                  <p key={i} className="text-center text-xs font-medium text-slate-500">
                    {msg.content}
                  </p>
                )
              }
              return (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 text-sm leading-6 ${
                    msg.role === 'user'
                      ? 'rounded-2xl rounded-br-sm bg-cyan-500 text-white'
                      : 'rounded-2xl rounded-bl-sm border border-slate-700 bg-slate-800 text-slate-100'
                  }`}>
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
          </div>

          {messages.length === 1 && (
            <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {CHIPS.map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setInput(chip)}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-800 bg-slate-900 px-4 py-2">
            <button
              type="button"
              onClick={() => setView('report')}
              className="text-xs font-semibold text-red-400 transition-colors hover:text-red-300"
            >
              Report a bug →
            </button>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} data-assistant-form className="border-t border-slate-800 bg-slate-900 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                }}
                rows={2}
                placeholder="Ask the assistant…"
                className="min-h-11 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
              {ttsSupported && (
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
                  onClick={() => voiceState === 'listening' ? stopListening() : startListening()}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    voiceState === 'listening'
                      ? 'animate-pulse bg-red-500 text-white'
                      : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                  title={voiceState === 'listening' ? 'Tap to stop' : 'Tap to speak'}
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
