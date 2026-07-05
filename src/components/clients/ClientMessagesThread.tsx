'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

export type ClientMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  created_at: string
  sender_name: string | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ClientMessagesThread({
  clientId,
  initialMessages,
  hasEmail,
}: {
  clientId: string
  initialMessages: ClientMessage[]
  hasEmail: boolean
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (!body.trim() || sending) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await res.json() as { ok?: boolean; id?: string; error?: string }
    if (!res.ok || !data.ok) {
      setError(data.error ?? 'Failed to send')
      setSending(false)
      return
    }
    setMessages(prev => [...prev, {
      id: data.id!, direction: 'outbound', body, created_at: new Date().toISOString(), sender_name: 'You',
    }])
    setBody('')
    setSending(false)
  }

  if (!hasEmail) {
    return (
      <p className="text-sm text-gray-500 dark:text-slate-400">
        Add an email address to this client before sending messages.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">No messages yet.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex flex-col ${m.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 px-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                {m.direction === 'outbound' ? (m.sender_name ?? 'You') : 'Client'} — {fmtTime(m.created_at)}
              </span>
              <div className={`max-w-md whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm ${
                m.direction === 'outbound'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200'
              }`}>
                {m.body}
              </div>
            </div>
          ))
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="Type a message…"
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
