'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { ChatConversation, ChatMember } from '@/lib/chat/types'

type LiveInsert = { conversationId: string; messageId: string; senderId: string; at: string }

function pingSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    ctx.close()
  } catch {
    // AudioContext blocked or unavailable
  }
}

function showInAppNotification(
  senderId: string,
  body: string,
  conversationId: string,
  members: Record<string, ChatMember>,
) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const m = members[senderId]
  const name = m?.full_name || m?.email || 'New message'
  const preview = body.trim().length > 80 ? body.trim().slice(0, 77) + '…' : body.trim() || 'Sent an attachment'
  const n = new Notification(name, {
    body: preview,
    icon: '/icon-192.png',
    tag: `chat:${conversationId}`,
    silent: true,
  })
  n.onclick = () => {
    window.focus()
    window.location.href = `/dashboard/chat?c=${conversationId}`
  }
}

type ChatContextValue = {
  userId: string
  loading: boolean
  conversations: ChatConversation[]
  members: Record<string, ChatMember>
  unreadByConversation: Record<string, number>
  unreadTotal: number
  activeConversationId: string | null
  lastInsert: LiveInsert | null
  setActiveConversation: (id: string | null) => void
  markRead: (id: string) => Promise<void>
  refreshConversations: () => Promise<void>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatRealtimeProvider')
  return ctx
}

/** Nav badge consumers can use this safely even outside the provider. */
export function useChatUnreadTotal(): number {
  return useContext(ChatContext)?.unreadTotal ?? 0
}

export default function ChatRealtimeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [members, setMembers] = useState<Record<string, ChatMember>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [lastInsert, setLastInsert] = useState<LiveInsert | null>(null)
  const activeRef = useRef<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, org_id, type, title, dm_key, created_at')
      .order('created_at', { ascending: true })
    setConversations((data ?? []) as ChatConversation[])
  }, [supabase])

  const loadMembers = useCallback(async () => {
    const { data: membership } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership?.org_id) return
    const { data } = await supabase
      .from('organisation_members')
      .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', membership.org_id)
    const map: Record<string, ChatMember> = {}
    for (const row of (data ?? []) as unknown as {
      user_id: string
      role: ChatMember['role']
      profiles: { full_name: string | null; email: string } | null
    }[]) {
      map[row.user_id] = {
        user_id: row.user_id,
        role: row.role,
        full_name: row.profiles?.full_name ?? null,
        email: row.profiles?.email ?? '',
        username: null,
        nickname: null,
        avatar_url: null,
        avatar_config: null,
      }
    }
    setMembers(map)
  }, [supabase, userId])

  const loadUnread = useCallback(async () => {
    const { data } = await supabase.rpc('get_chat_unread')
    const map: Record<string, number> = {}
    for (const row of (data ?? []) as { conversation_id: string; unread_count: number }[]) {
      map[row.conversation_id] = Number(row.unread_count)
    }
    setUnread(map)
  }, [supabase])

  const markRead = useCallback(async (id: string) => {
    setUnread(prev => ({ ...prev, [id]: 0 }))
    await supabase
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('user_id', userId)
  }, [supabase, userId])

  const setActiveConversation = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveConversationId(id)
    if (id) markRead(id)
  }, [markRead])

  // Keep refs so subscription closures always see current state without re-subscribing.
  const conversationsRef = useRef<ChatConversation[]>([])
  const membersRef = useRef<Record<string, ChatMember>>({})
  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  useEffect(() => { membersRef.current = members }, [members])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.all([loadConversations(), loadMembers(), loadUnread()])
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [loadConversations, loadMembers, loadUnread])

  // Single Postgres-Changes subscription; RLS filters to our conversations.
  useEffect(() => {
    const channel = supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => {
          const row = payload.new as {
            id: string; conversation_id: string; sender_id: string; body: string; created_at: string
          }
          setLastInsert({
            conversationId: row.conversation_id,
            messageId: row.id,
            senderId: row.sender_id,
            at: row.created_at,
          })
          if (row.sender_id !== userId && row.conversation_id !== activeRef.current) {
            setUnread(prev => ({
              ...prev,
              [row.conversation_id]: (prev[row.conversation_id] ?? 0) + 1,
            }))
            pingSound()
            showInAppNotification(row.sender_id, row.body, row.conversation_id, membersRef.current)
          }
          // Surface brand-new DM conversations the moment their first message lands.
          if (!conversationsRef.current.some(c => c.id === row.conversation_id)) {
            loadConversations()
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, userId, loadConversations])

  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((a, b) => a + b, 0),
    [unread],
  )

  const value: ChatContextValue = {
    userId,
    loading,
    conversations,
    members,
    unreadByConversation: unread,
    unreadTotal,
    activeConversationId,
    lastInsert,
    setActiveConversation,
    markRead,
    refreshConversations: loadConversations,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
