'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellOff, ChevronDown, Megaphone, Plus, Users, Video } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
import { createClient } from '@/lib/supabase-browser'
import ScrollFade from '@/components/ui/ScrollFade'

type ScheduledCall = {
  id: string
  title: string
  starts_at: string
  daily_room_name: string
}

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

function fmtMeetingTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function ConversationList({
  onNewDm,
  onNewGroup,
}: {
  onNewDm: () => void
  onNewGroup: () => void
}) {
  const { userId, orgId, conversations, members, unreadByConversation, activeConversationId, setActiveConversation, mutedConversations } = useChat()
  const [collapsedGroups, setCollapsedGroups] = useState(false)
  const [collapsedDMs, setCollapsedDMs] = useState(false)
  const [meetings, setMeetings] = useState<ScheduledCall[]>([])

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    const now = new Date().toISOString()
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('scheduled_calls')
      .select('id, title, starts_at, daily_room_name')
      .eq('org_id', orgId)
      .gte('starts_at', now)
      .lte('starts_at', nextWeek)
      .order('starts_at')
      .limit(5)
      .then(({ data }) => setMeetings((data ?? []) as ScheduledCall[]))
  }, [orgId])

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
        {mutedConversations.has(conv.id) ? (
          <BellOff size={13} className="ml-auto shrink-0 text-gray-300 dark:text-slate-600" />
        ) : unread > 0 ? (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 dark:border-slate-800">
      <div className="px-4 py-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Messages</h2>
      </div>
      <ScrollFade wrapperClassName="flex-1" className="px-2 pb-4">

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <div className="mb-2">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Upcoming Meetings</p>
            <div className="space-y-1">
              {meetings.map(m => (
                <div key={m.id} className="flex items-center gap-2 rounded-xl px-2 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600 dark:bg-teal-950">
                    <Video size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{m.title}</span>
                    <span className="block text-[10px] leading-tight text-gray-400">{fmtMeetingTime(m.starts_at)}</span>
                  </span>
                  <Link
                    href={`/dashboard/video/${m.id}`}
                    className="shrink-0 rounded-lg bg-cyan-500 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-cyan-600"
                  >
                    Join
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channels */}
        {channels.length > 0 && (
          <div className="mb-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Channels</p>
            <div className="space-y-0.5">{channels.map(row)}</div>
          </div>
        )}

        {/* Groups — collapsible */}
        <div className="mb-1 mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <button
              onClick={() => setCollapsedGroups(v => !v)}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-300"
            >
              <ChevronDown
                size={12}
                className={`transition-transform duration-150 ${collapsedGroups ? '-rotate-90' : ''}`}
              />
              Groups
            </button>
            <button
              onClick={onNewGroup}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New group"
            >
              <Plus size={13} />
            </button>
          </div>
          {!collapsedGroups && (
            groups.length === 0 ? (
              <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No groups yet.</p>
            ) : (
              <div className="space-y-0.5">{groups.map(row)}</div>
            )
          )}
        </div>

        {/* Direct Messages — collapsible */}
        <div className="mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <button
              onClick={() => setCollapsedDMs(v => !v)}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-300"
            >
              <ChevronDown
                size={12}
                className={`transition-transform duration-150 ${collapsedDMs ? '-rotate-90' : ''}`}
              />
              Direct Messages
            </button>
            <button
              onClick={onNewDm}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New message"
            >
              <Plus size={13} />
            </button>
          </div>
          {!collapsedDMs && (
            dms.length === 0 ? (
              <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No messages yet.</p>
            ) : (
              <div className="space-y-0.5">{dms.map(row)}</div>
            )
          )}
        </div>

      </ScrollFade>
    </div>
  )
}
