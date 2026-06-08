'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import AttachmentChip from '@/components/chat/AttachmentChip'
import type { ChatMessage } from '@/lib/chat/types'

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

function senderName(members: ReturnType<typeof useChat>['members'], id: string): string {
  const m = members[id]
  return m?.full_name || m?.email || 'Unknown'
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function MessageThread({ conversationId, isChannel }: { conversationId: string; isChannel: boolean }) {
  const { userId, members, lastInsert } = useChat()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const myRole = members[userId]?.role

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }, [])

  // Initial / conversation-switch load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!cancelled) {
        setMessages((data ?? []) as unknown as ChatMessage[])
        scrollToBottom()
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Live append: when a new message lands in THIS conversation, fetch it with attachments.
  useEffect(() => {
    if (!lastInsert || lastInsert.conversationId !== conversationId) return
    ;(async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select(MESSAGE_SELECT)
        .eq('id', lastInsert.messageId)
        .maybeSingle()
      if (!data) return
      setMessages(prev =>
        prev.some(m => m.id === data.id) ? prev : [...prev, data as unknown as ChatMessage])
      scrollToBottom()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInsert])

  async function handleDelete(id: string) {
    await supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m)))
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
      {messages.length === 0 && (
        <p className="text-center text-sm font-medium text-gray-400">No messages yet.</p>
      )}
      {messages.map(m => {
        const mine = m.sender_id === userId
        const removable = !m.deleted_at && (mine || (isChannel && canModerate(myRole)))
        return (
          <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
            <div className="mb-0.5 flex items-center gap-2 px-1">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {mine ? 'You' : senderName(members, m.sender_id)}
              </span>
              <span className="text-[10px] font-medium text-gray-400">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {removable && (
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-gray-300 transition-colors hover:text-red-500"
                  title="Delete message"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div
              className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                m.deleted_at
                  ? 'bg-gray-100 italic text-gray-400 dark:bg-slate-800'
                  : mine
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {m.deleted_at ? 'message removed' : m.body}
            </div>
            {!m.deleted_at && m.chat_attachments?.map(a => <AttachmentChip key={a.id} attachment={a} />)}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
