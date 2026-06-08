'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import ConversationList from '@/components/chat/ConversationList'
import MessageThread from '@/components/chat/MessageThread'
import MessageComposer from '@/components/chat/MessageComposer'
import NewDmDialog from '@/components/chat/NewDmDialog'
import type { ChatConversation } from '@/lib/chat/types'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function ChatClient() {
  const { userId, conversations, members, activeConversationId, setActiveConversation, loading } = useChat()
  const [showNewDm, setShowNewDm] = useState(false)
  const searchParams = useSearchParams()

  // Deep link: /dashboard/chat?c=<id> (e.g. from a push notification).
  useEffect(() => {
    const c = searchParams.get('c')
    if (c) setActiveConversation(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations.length])

  const active = conversations.find(c => c.id === activeConversationId) ?? null
  const isChannel = active?.type === 'channel'
  const peerId = active ? dmPeerId(active, userId) : null
  const peer = peerId ? members[peerId] : null
  const canPost = active ? (isChannel ? canModerate(members[userId]?.role) : true) : false

  const title = !active
    ? ''
    : isChannel
      ? (active.title ?? 'Announcements')
      : (peer?.full_name || peer?.email || 'Direct message')

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:h-[calc(100vh-7rem)]">
      <ConversationList onNewDm={() => setShowNewDm(true)} />

      <div className="flex flex-1 flex-col">
        {active ? (
          <>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
              {isChannel && (
                <p className="text-xs font-medium text-gray-400">Org-wide · managers can post</p>
              )}
            </div>
            <MessageThread conversationId={active.id} isChannel={isChannel} />
            <MessageComposer
              conversationId={active.id}
              canPost={canPost}
              peerUserId={peerId ?? undefined}
              peerName={peer?.full_name || peer?.email || undefined}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
            <MessageSquare size={40} className="mb-3" />
            <p className="text-sm font-medium">
              {loading ? 'Loading…' : 'Select a conversation to start chatting.'}
            </p>
          </div>
        )}
      </div>

      {showNewDm && (
        <NewDmDialog onClose={() => setShowNewDm(false)} onStarted={id => setActiveConversation(id)} />
      )}
    </div>
  )
}
