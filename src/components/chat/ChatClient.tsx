'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MessageSquare, Settings } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import ConversationList from '@/components/chat/ConversationList'
import MessageThread from '@/components/chat/MessageThread'
import MessageComposer from '@/components/chat/MessageComposer'
import NewDmDialog from '@/components/chat/NewDmDialog'
import NewGroupDialog from '@/components/chat/NewGroupDialog'
import GroupSettingsPanel from '@/components/chat/GroupSettingsPanel'
import PushPermission from '@/components/PushPermission'
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
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const c = searchParams.get('c')
    if (c) setActiveConversation(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations.length])

  useEffect(() => {
    if (!loading && !activeConversationId && conversations.length > 0) {
      setActiveConversation(conversations[0].id)
    }
  }, [loading, activeConversationId, conversations, setActiveConversation])

  // Close settings panel when switching conversations
  useEffect(() => {
    setShowGroupSettings(false)
  }, [activeConversationId])

  const active = conversations.find(c => c.id === activeConversationId) ?? null
  const isChannel = active?.type === 'channel'
  const isGroup = active?.type === 'group'
  const peerId = active ? dmPeerId(active, userId) : null
  const peer = peerId ? members[peerId] : null
  const canPost = active ? (isChannel ? canModerate(members[userId]?.role) : true) : false

  const title = !active
    ? ''
    : isChannel
      ? (active.title ?? 'Announcements')
      : isGroup
        ? (active.title ?? 'Group chat')
        : (peer?.full_name || peer?.email || 'Direct message')

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:h-[calc(100vh-7rem)]">

      {/* Sidebar */}
      <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col`}>
        <ConversationList
          onNewDm={() => setShowNewDm(true)}
          onNewGroup={() => setShowNewGroup(true)}
        />
        <div className="border-t border-gray-100 p-3 dark:border-slate-800">
          <PushPermission />
        </div>
      </div>

      {/* Thread panel */}
      <div className={`min-w-0 flex-1 ${active ? 'flex' : 'hidden md:flex'}`}>
        <div className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-slate-800">
                <button
                  onClick={() => setActiveConversation(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
                  {isChannel && (
                    <p className="text-xs font-medium text-gray-400">Org-wide · managers can post</p>
                  )}
                </div>
                {isGroup && (
                  <button
                    onClick={() => setShowGroupSettings(v => !v)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      showGroupSettings
                        ? 'bg-cyan-50 text-cyan-500 dark:bg-slate-700'
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                    title="Group settings"
                  >
                    <Settings size={16} />
                  </button>
                )}
              </div>
              <MessageThread conversationId={active.id} isChannel={isChannel} />
              <MessageComposer
                conversationId={active.id}
                canPost={canPost}
                userId={userId}
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

        {showGroupSettings && active?.type === 'group' && (
          <GroupSettingsPanel
            conversationId={active.id}
            groupTitle={active.title ?? ''}
            createdBy={active.created_by}
            onClose={() => setShowGroupSettings(false)}
            onLeft={() => { setShowGroupSettings(false); setActiveConversation(null) }}
          />
        )}
      </div>

      {showNewDm && (
        <NewDmDialog onClose={() => setShowNewDm(false)} onStarted={id => setActiveConversation(id)} />
      )}
      {showNewGroup && (
        <NewGroupDialog onClose={() => setShowNewGroup(false)} onStarted={id => setActiveConversation(id)} />
      )}
    </div>
  )
}
