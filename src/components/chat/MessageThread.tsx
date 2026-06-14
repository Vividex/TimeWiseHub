'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import AttachmentChip from '@/components/chat/AttachmentChip'
import { displayName } from '@/lib/chat/types'
import type { ChatMessage } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

function senderName(members: ReturnType<typeof useChat>['members'], id: string): string {
  return displayName(members[id])
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function MessageThread({ conversationId, isChannel }: { conversationId: string; isChannel: boolean }) {
  const { userId, members } = useChat()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [readAt, setReadAt] = useState<Record<string, string>>({})
  const [typingIds, setTypingIds] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  // Stable client — creating a new instance on every render would cause the
  // subscription effect to re-subscribe on every keystroke in the composer.
  const supabase = useMemo(() => createClient(), [])
  const myRole = members[userId]?.role

  // Per-user timers that auto-clear typing indicator after 4s (fallback for lost stop_typing)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }, [])

  // Initial load / conversation switch
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setReadAt({})
    setTypingIds(new Set())
    // Clear any pending typing timers from the previous conversation
    Object.values(typingTimers.current).forEach(clearTimeout)
    typingTimers.current = {}
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
  }, [conversationId, supabase, scrollToBottom])

  // Live subscription: each thread subscribes directly, filtered to its own
  // conversation. More reliable than threading through the provider's lastInsert.
  useEffect(() => {
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: string }).id
          const { data } = await supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT)
            .eq('id', id)
            .maybeSingle()
          if (!data) return
          setMessages(prev =>
            prev.some(m => m.id === (data as unknown as ChatMessage).id)
              ? prev
              : [...prev, data as unknown as ChatMessage],
          )
          scrollToBottom()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase, scrollToBottom])

  // Load initial read positions for all participants
  useEffect(() => {
    let cancelled = false
    supabase
      .from('chat_participants')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId)
      .then(({ data }) => {
        if (cancelled || !data) return
        const map: Record<string, string> = {}
        for (const row of data as { user_id: string; last_read_at: string }[]) {
          map[row.user_id] = row.last_read_at
        }
        setReadAt(map)
      })
    return () => { cancelled = true }
  }, [conversationId, supabase])

  // Real-time read receipt updates
  useEffect(() => {
    const channel = supabase
      .channel(`participants-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string }
          setReadAt(prev => ({ ...prev, [row.user_id]: row.last_read_at }))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase])

  // Typing indicator — subscribe to broadcasts from the conversation channel
  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const typingId = (payload.payload as { userId: string }).userId
        if (typingId === userId) return
        setTypingIds(prev => new Set([...prev, typingId]))
        // Reset auto-clear timer for this user
        if (typingTimers.current[typingId]) clearTimeout(typingTimers.current[typingId])
        typingTimers.current[typingId] = setTimeout(() => {
          setTypingIds(prev => { const next = new Set(prev); next.delete(typingId); return next })
          delete typingTimers.current[typingId]
        }, 4000)
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        const typingId = (payload.payload as { userId: string }).userId
        if (typingTimers.current[typingId]) {
          clearTimeout(typingTimers.current[typingId])
          delete typingTimers.current[typingId]
        }
        setTypingIds(prev => { const next = new Set(prev); next.delete(typingId); return next })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase, userId])

  async function handleDelete(id: string) {
    await supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m)))
  }

  // For DMs only: find the last outgoing message the peer has already read
  const lastReadMsgId = !isChannel
    ? (() => {
        const peerLastRead = Object.entries(readAt).find(([id]) => id !== userId)?.[1]
        if (!peerLastRead) return null
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]
          if (m.sender_id === userId && !m.deleted_at && m.created_at <= peerLastRead) return m.id
        }
        return null
      })()
    : null

  const typingNames = [...typingIds].map(id => senderName(members, id))

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
              {!mine && (
                <UserAvatar
                  avatarUrl={members[m.sender_id]?.avatar_url}
                  name={senderName(members, m.sender_id)}
                  size={20}
                />
              )}
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
            {m.id === lastReadMsgId && (
              <p className="mt-0.5 px-1 text-[10px] font-medium text-cyan-400">Read</p>
            )}
          </div>
        )
      })}

      {/* Typing indicator */}
      {typingNames.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-end gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
          </div>
          <span className="text-xs font-medium text-gray-400">
            {typingNames.length === 1
              ? `${typingNames[0]} is typing…`
              : `${typingNames.join(', ')} are typing…`}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
