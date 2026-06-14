'use client'

import { Megaphone, Plus, Users } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

export default function ConversationList({
  onNewDm,
  onNewGroup,
}: {
  onNewDm: () => void
  onNewGroup: () => void
}) {
  const { userId, conversations, members, unreadByConversation, activeConversationId, setActiveConversation } = useChat()

  const channels = conversations.filter(c => c.type === 'channel')
  const groups = conversations.filter(c => c.type === 'group')
  const dms = conversations.filter(c => c.type === 'dm')

  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    if (conv.type === 'group') return conv.title ?? 'Group chat'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m ? displayName(m) : 'Direct message'
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
        ) : conv.type === 'group' ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950">
            <Users size={16} />
          </span>
        ) : (
          (() => {
            const peer = dmPeerId(conv, userId)
            const m = peer ? members[peer] : null
            return <UserAvatar avatarUrl={m?.avatar_url} name={label(conv)} size={36} />
          })()
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
      <div className="px-4 py-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Messages</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {channels.length > 0 && (
          <div className="mb-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Channels</p>
            <div className="space-y-0.5">{channels.map(row)}</div>
          </div>
        )}

        <div className="mb-1 mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Groups</p>
            <button
              onClick={onNewGroup}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New group"
            >
              <Plus size={13} />
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No groups yet.</p>
          ) : (
            <div className="space-y-0.5">{groups.map(row)}</div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Direct messages</p>
            <button
              onClick={onNewDm}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New message"
            >
              <Plus size={13} />
            </button>
          </div>
          {dms.length === 0 ? (
            <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No messages yet.</p>
          ) : (
            <div className="space-y-0.5">{dms.map(row)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
