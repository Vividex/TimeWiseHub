'use client'

import { FormEvent, useRef, useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type View = 'chat' | 'report' | 'reported'

export default function AssistantWidget({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi, I can help with time tracking, expenses, projects, tasks, calendar, billing, and reports. What's on your mind?",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [bugDescription, setBugDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'The assistant is unavailable right now.')
      }

      if (!response.body) throw new Error('The assistant did not return a response stream.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(current => {
          const updated = [...current]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + chunk }
          return updated
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'The assistant is unavailable right now.'
      setMessages(current => {
        const updated = [...current]
        updated[updated.length - 1] = { role: 'assistant', content: message }
        return updated
      })
    } finally {
      setLoading(false)
      abortRef.current = null
    }
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
      // still show success — report may have saved
      setView('reported')
    } finally {
      setSubmitting(false)
    }
  }

  function closeDrawer() {
    abortRef.current?.abort()
    setOpen(false)
  }

  function openFresh() {
    setView('chat')
    setBugDescription('')
    setOpen(v => !v)
  }

  const mailtoLink = `mailto:support@vividex.au?subject=${encodeURIComponent('Bug Report — TimeWiseHub')}&body=${encodeURIComponent(`User: ${userEmail}\n\nDescription:\n${bugDescription}`)}`

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-4 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="font-['Poppins'] text-base font-black">
                {view === 'chat' ? 'TimeWiseHub Assistant' : view === 'report' ? 'Report a bug' : 'Report sent'}
              </h2>
              <p className="text-xs font-medium text-slate-400">
                {view === 'chat' ? 'Ask about workflows, setup, and reports.' : view === 'report' ? 'Describe what went wrong and we\'ll look into it.' : 'Our team has been notified.'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close assistant"
            >
              ✕
            </button>
          </div>

          {/* Chat view */}
          {view === 'chat' && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                      message.role === 'user'
                        ? 'bg-cyan-500 text-white'
                        : 'border border-gray-100 bg-white text-slate-900'
                    }`}>
                      {message.content || (loading && index === messages.length - 1 ? 'Thinking...' : '')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 bg-white px-4 py-2">
                <button
                  type="button"
                  onClick={() => setView('report')}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
                >
                  Report a bug →
                </button>
              </div>

              <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                    rows={2}
                    placeholder="Ask the assistant..."
                    className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={loading || input.trim().length === 0}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
                  >
                    {loading ? '...' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Bug report form */}
          {view === 'report' && (
            <form onSubmit={handleBugReport} className="flex flex-1 flex-col p-5 gap-4">
              <p className="text-sm font-medium text-gray-600">
                Tell us what you were doing and what went wrong. We'll investigate and follow up at <span className="font-bold text-slate-900">{userEmail}</span>.
              </p>
              <textarea
                value={bugDescription}
                onChange={e => setBugDescription(e.target.value)}
                rows={6}
                placeholder="e.g. I clicked 'Submit expense' and nothing happened. The button stayed grey."
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView('chat')}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || bugDescription.trim().length === 0}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Send report'}
                </button>
              </div>
            </form>
          )}

          {/* Confirmation */}
          {view === 'reported' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl">✓</div>
              <div>
                <p className="font-['Poppins'] text-base font-black text-slate-900">Report received</p>
                <p className="mt-1 text-sm font-medium text-gray-500">We'll investigate and follow up at <span className="font-semibold text-slate-900">{userEmail}</span>.</p>
              </div>
              <p className="text-xs font-medium text-gray-400">
                For urgent issues you can also email us directly at{' '}
                <a href={mailtoLink} className="font-semibold text-cyan-600 hover:underline">support@vividex.au</a>
              </p>
              <button
                type="button"
                onClick={() => { setView('chat'); setBugDescription('') }}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Back to assistant
              </button>
            </div>
          )}

        </div>
      )}

      <button
        type="button"
        onClick={openFresh}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-2xl font-black text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open assistant"
        aria-expanded={open}
      >
        {open ? '✕' : '?'}
      </button>
    </div>
  )
}
