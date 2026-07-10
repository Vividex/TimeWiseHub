// src/components/chat/TeamChatWidget.tsx
'use client'

import { useState } from 'react'
import { ArrowLeft, GripVertical } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import MessageThread from '@/components/chat/MessageThread'
import MessageComposer from '@/components/chat/MessageComposer'
import ScrollFade from '@/components/ui/ScrollFade'
import type { ChatConversation } from '@/lib/chat/types'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function TeamChatWidget({
  onClose,
  onHeaderPointerDown,
}: {
  onClose: () => void
  onHeaderPointerDown?: (e: React.PointerEvent) => void
}) {
  const { userId, conversations, members, unreadByConversation, setActiveConversation, loading } = useChat()
  const [localActive, setLocalActive] = useState<string | null>(null)

  const channels = conversations.filter(c => c.type === 'channel')
  const dms = conversations.filter(c => c.type === 'dm')

  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m?.full_name || m?.email || 'Direct message'
  }

  const active = conversations.find(c => c.id === localActive) ?? null
  const isChannel = active?.type === 'channel'
  const peerId = active ? dmPeerId(active, userId) : null
  const peer = peerId ? members[peerId] : null
  const canPost = active ? (isChannel ? canModerate(members[userId]?.role) : true) : false
  const title = !active
    ? ''
    : isChannel
      ? (active.title ?? 'Announcements')
      : (peer?.full_name || peer?.email || 'Direct message')

  function openConversation(id: string) {
    setLocalActive(id)
    setActiveConversation(id)
  }

  return (
    <div className="flex h-[min(560px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical size={14} className="shrink-0 text-slate-600" aria-hidden />
          {localActive && (
            <button
              onClick={() => setLocalActive(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-black truncate">{localActive ? title : 'Team Chat'}</h2>
            {!localActive && (
              <a href="/dashboard/chat" className="text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Open full chat →
              </a>
            )}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">✕</button>
      </div>

      {/* Body */}
      {!localActive ? (
        <ScrollFade wrapperClassName="flex-1" className="px-2 py-2 space-y-0.5">
          {loading && <p className="px-3 py-2 text-sm text-gray-400">Loading…</p>}
          {[...channels, ...dms].map(conv => {
            const unread = unreadByConversation[conv.id] ?? 0
            return (
              <button
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${
                  conv.type === 'channel' ? 'bg-amber-500' : 'bg-cyan-500'
                }`}>
                  {label(conv).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {label(conv)}
                </span>
                {unread > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )
          })}
          {!loading && conversations.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">No conversations yet.</p>
          )}
        </ScrollFade>
      ) : (
        <div className="flex flex-1 flex-col min-h-0">
          <MessageThread conversationId={active!.id} isChannel={isChannel} />
          <MessageComposer
            conversationId={active!.id}
            canPost={canPost}
            userId={userId}
            peerUserId={peerId ?? undefined}
            peerName={peer?.full_name || peer?.email || undefined}
          />
        </div>
      )}
    </div>
  )
}
