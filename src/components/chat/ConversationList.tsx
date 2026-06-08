'use client'

import { Megaphone, Plus } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import type { ChatConversation } from '@/lib/chat/types'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

export default function ConversationList({ onNewDm }: { onNewDm: () => void }) {
  const { userId, conversations, members, unreadByConversation, activeConversationId, setActiveConversation } = useChat()

  const channels = conversations.filter(c => c.type === 'channel')
  const dms = conversations.filter(c => c.type === 'dm')

  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m?.full_name || m?.email || 'Direct message'
  }

  function row(conv: ChatConversation) {
    const unread = unreadByConversation[conv.id] ?? 0
    const active = conv.id === activeConversationId
    return (
      <button
        key={conv.id}
        onClick={() => setActiveConversation(conv.id)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          active ? 'bg-cyan-50 dark:bg-slate-800' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
        }`}
      >
        {conv.type === 'channel' ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950">
            <Megaphone size={16} />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
            {label(conv).slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label(conv)}</span>
        </span>
        {unread > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Messages</h2>
        <button
          onClick={onNewDm}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-white transition-colors hover:bg-cyan-600"
          title="New message"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {channels.map(row)}
        {dms.length > 0 && <div className="my-2 border-t border-gray-100 dark:border-slate-800" />}
        {dms.map(row)}
      </div>
    </div>
  )
}
