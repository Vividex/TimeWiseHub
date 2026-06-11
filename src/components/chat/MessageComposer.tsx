'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { Availability } from '@/lib/chat/types'

const HINT_TEXT: Record<NonNullable<Availability['reason']>, (name: string) => string> = {
  after_hours: name => `It's after hours for ${name} — they'll see this later.`,
  on_leave: name => `${name} is on leave — they'll see this when they're back.`,
  holiday: name => `It's a public holiday for ${name} — they'll see this later.`,
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export default function MessageComposer({
  conversationId,
  canPost,
  userId,
  peerUserId,
  peerName,
}: {
  conversationId: string
  canPost: boolean
  userId: string
  peerUserId?: string
  peerName?: string
}) {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // Refs for managing typing broadcasts
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef(0)

  // Subscribe to broadcast channel so we can send typing events
  useEffect(() => {
    const channel = supabase.channel(`conv:${conversationId}`)
    channel.subscribe()
    typingChannelRef.current = channel
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      // Signal stop-typing before unsubscribing (conversation switch or unmount)
      channel.send({ type: 'broadcast', event: 'stop_typing', payload: { userId } }).catch(() => {})
      supabase.removeChannel(channel)
      typingChannelRef.current = null
      lastTypingSentRef.current = 0
    }
  }, [conversationId, supabase, userId])

  // Sender-side availability hint for DMs.
  useEffect(() => {
    setHint(null)
    if (!peerUserId) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/chat/availability?userId=${peerUserId}`)
      if (!res.ok) return
      const data: Availability = await res.json()
      if (!cancelled && !data.available && data.reason && peerName) {
        setHint(HINT_TEXT[data.reason](peerName))
      }
    })()
    return () => { cancelled = true }
  }, [peerUserId, peerName])

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)

    // Throttle: broadcast typing at most once every 2 seconds
    const now = Date.now()
    if (typingChannelRef.current && now - lastTypingSentRef.current > 2000) {
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId } }).catch(() => {})
      lastTypingSentRef.current = now
    }

    // Auto stop-typing after 3s of no keystrokes
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      typingChannelRef.current?.send({ type: 'broadcast', event: 'stop_typing', payload: { userId } }).catch(() => {})
      lastTypingSentRef.current = 0
    }, 3000)
  }

  async function handleSend() {
    if (sending) return
    if (!body.trim() && files.length === 0) return
    setSending(true)

    // Clear typing state immediately on send
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingChannelRef.current?.send({ type: 'broadcast', event: 'stop_typing', payload: { userId } }).catch(() => {})
    lastTypingSentRef.current = 0

    const messageId = crypto.randomUUID()
    const attachments: { storage_path: string; file_name: string; mime_type: string; size_bytes: number }[] = []

    try {
      for (const file of files) {
        const path = `${conversationId}/${messageId}/${crypto.randomUUID()}-${safeName(file.name)}`
        const { error } = await supabase.storage.from('chat-attachments').upload(path, file)
        if (error) throw error
        attachments.push({
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        })
      }

      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId, conversation_id: conversationId, body, attachments }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Failed to send message')
        return
      }
      setBody('')
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setSending(false)
    }
  }

  if (!canPost) {
    return (
      <div className="border-t border-gray-200 px-4 py-4 text-center text-sm font-medium text-gray-400 dark:border-slate-800">
        Only managers can post to the Announcements channel.
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 px-4 py-3 dark:border-slate-800">
      {hint && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          {hint}
        </p>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {f.name}
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-slate-700 dark:hover:bg-slate-800"
          title="Attach files"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => setFiles(Array.from(e.target.files ?? []))}
        />
        <textarea
          value={body}
          onChange={handleBodyChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
