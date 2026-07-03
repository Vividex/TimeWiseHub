'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import AttachmentChip from '@/components/chat/AttachmentChip'
import type { ChatMessage } from '@/lib/chat/types'

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SessionCallChat({ conversationId }: { conversationId: string }) {
  const [show, setShow] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!show || loaded) return
    ;(async () => {
      const [{ data: msgs }, { data: participants }] = await Promise.all([
        supabase
          .from('chat_messages')
          .select(MESSAGE_SELECT)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200),
        supabase
          .from('chat_participants')
          .select('user_id, profiles(full_name, email)')
          .eq('conversation_id', conversationId),
      ])
      setMessages((msgs ?? []) as unknown as ChatMessage[])
      const map: Record<string, string> = {}
      for (const row of (participants ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[]) {
        map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'Unknown'
      }
      setNames(map)
      setLoaded(true)
    })()
  }, [show, loaded, conversationId, supabase])

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400"
      >
        <ChevronDown size={14} className={`transition-transform ${show ? '' : '-rotate-90'}`} />
        Call Chat
      </button>
      {show && (
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">No messages yet.</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className="text-sm">
                <span className="font-semibold text-gray-700 dark:text-slate-300">{names[m.sender_id] ?? 'Unknown'}</span>
                <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{fmtTime(m.created_at)}</span>
                <p className="mt-0.5 text-gray-600 dark:text-slate-400">{m.deleted_at ? 'message removed' : m.body}</p>
                {!m.deleted_at && m.chat_attachments?.map(a => <AttachmentChip key={a.id} attachment={a} />)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
