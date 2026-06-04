'use client'

import { FormEvent, useRef, useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi, I can help with time tracking, expenses, projects, tasks, calendar, billing, and reports.',
    },
  ])
  const [loading, setLoading] = useState(false)
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

  function closeDrawer() {
    abortRef.current?.abort()
    setOpen(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-4 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="font-['Poppins'] text-base font-black">TimeWiseHub Assistant</h2>
              <p className="text-xs font-medium text-slate-400">Ask about workflows, setup, and reports.</p>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close assistant"
            >
              X
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-cyan-500 text-white'
                      : 'border border-gray-100 bg-white text-slate-900'
                  }`}
                >
                  {message.content || (loading && index === messages.length - 1 ? 'Thinking...' : '')}
                </div>
              </div>
            ))}
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
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-2xl font-black text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open assistant"
        aria-expanded={open}
      >
        {open ? 'X' : '?'}
      </button>
    </div>
  )
}
