'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import AttachmentChip from '@/components/chat/AttachmentChip'
import MessageComposer from '@/components/chat/MessageComposer'
import ScrollFade from '@/components/ui/ScrollFade'
import type { ChatMessage } from '@/lib/chat/types'

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, deleted_at, created_at, chat_attachments(*)'

export default function RoomChatTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!cancelled) setMessages((data ?? []) as unknown as ChatMessage[])
    })()
    return () => { cancelled = true }
  }, [conversationId, supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('chat_participants')
        .select('user_id, profiles(full_name, email)')
        .eq('conversation_id', conversationId)
      if (cancelled || !data) return
      const map: Record<string, string> = {}
      for (const row of data as unknown as { user_id: string; profiles: { full_name: string | null; email: string } | null }[]) {
        map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'Unknown'
      }
      setNames(map)
    })()
    return () => { cancelled = true }
  }, [conversationId, supabase])

  useEffect(() => {
    const channel = supabase
      .channel(`session-chat-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
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
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase])

  return (
    <>
      <ScrollFade wrapperClassName="flex-1" className="p-2 space-y-2" fadeFrom="from-slate-900">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500 px-1 py-2">No messages yet.</p>
        ) : (
          messages.map(m => {
            const mine = m.sender_id === userId
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className="mb-0.5 flex items-center gap-1 px-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    {mine ? 'You' : names[m.sender_id] ?? 'Unknown'}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(m.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`max-w-[240px] whitespace-pre-line rounded-xl px-3 py-1.5 text-xs ${
                    m.deleted_at
                      ? 'bg-slate-800 italic text-slate-500'
                      : mine
                        ? 'bg-cyan-500 text-white'
                        : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {m.deleted_at ? 'message removed' : m.body}
                </div>
                {!m.deleted_at && m.chat_attachments?.map(a => <AttachmentChip key={a.id} attachment={a} />)}
              </div>
            )
          })
        )}
      </ScrollFade>
      <MessageComposer conversationId={conversationId} canPost userId={userId} />
    </>
  )
}
