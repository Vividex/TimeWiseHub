'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
import ScrollFade from '@/components/ui/ScrollFade'

export default function NewGroupDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (conversationId: string) => void
}) {
  const { userId, members, refreshConversations } = useChat()
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const others = Object.values(members).filter(m => m.user_id !== userId)

  function toggleMember(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function createGroup() {
    if (busy || !groupName.trim() || selectedIds.size === 0) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group_chat', {
      p_title: groupName.trim(),
      p_member_ids: Array.from(selectedIds),
    })
    if (error || !data) {
      alert(error?.message ?? 'Failed to create group')
      setBusy(false)
      return
    }
    await refreshConversations()
    onStarted(data as string)
    onClose()
  }

  const canCreate = groupName.trim().length > 0 && selectedIds.size > 0 && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New group</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          placeholder="Group name"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Add members</p>
        <ScrollFade wrapperClassName="max-h-64" className="space-y-1">
          {others.length === 0 && (
            <p className="text-sm font-medium text-gray-400">No other members in your organisation yet.</p>
          )}
          {others.map(m => {
            const selected = selectedIds.has(m.user_id)
            return (
              <button
                key={m.user_id}
                onClick={() => toggleMember(m.user_id)}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                  selected ? 'bg-cyan-50 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {displayName(m)}
                  </span>
                  <span className="block truncate text-xs font-medium capitalize text-gray-400">{m.role}</span>
                </span>
                {selected && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500">
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            )
          })}
        </ScrollFade>
        <button
          onClick={createGroup}
          disabled={!canCreate}
          className="mt-4 w-full rounded-xl bg-cyan-500 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </div>
  )
}
