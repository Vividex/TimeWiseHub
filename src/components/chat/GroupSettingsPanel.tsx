'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogOut, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
import ScrollFade from '@/components/ui/ScrollFade'

export default function GroupSettingsPanel({
  conversationId,
  groupTitle,
  createdBy,
  onClose,
  onLeft,
}: {
  conversationId: string
  groupTitle: string
  createdBy: string | null
  onClose: () => void
  onLeft: () => void
}) {
  const { userId, members, refreshConversations } = useChat()
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [title, setTitle] = useState(groupTitle)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { setTitle(groupTitle) }, [groupTitle])

  useEffect(() => {
    supabase
      .from('chat_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .then(({ data }) => {
        setParticipantIds((data ?? []).map(r => (r as { user_id: string }).user_id))
      })
  }, [conversationId, supabase])

  const isCreator = userId === createdBy
  const participantMembers = participantIds
    .map(id => members[id])
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
  const nonParticipants = Object.values(members).filter(m => !participantIds.includes(m.user_id))

  async function renameGroup() {
    if (!title.trim() || title.trim() === groupTitle || busy) return
    setBusy(true)
    await supabase.from('chat_conversations').update({ title: title.trim() }).eq('id', conversationId)
    await refreshConversations()
    setBusy(false)
  }

  async function addMember(targetId: string) {
    setBusy(true)
    const { error } = await supabase.from('chat_participants').insert({
      conversation_id: conversationId,
      user_id: targetId,
      last_read_at: new Date().toISOString(),
    })
    if (!error) setParticipantIds(prev => [...prev, targetId])
    setBusy(false)
  }

  async function removeMember(targetId: string) {
    setBusy(true)
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', targetId)
    if (!error) setParticipantIds(prev => prev.filter(id => id !== targetId))
    setBusy(false)
  }

  async function leaveGroup() {
    if (!confirm('Leave this group? You will no longer see messages here.')) return
    setBusy(true)
    await supabase
      .from('chat_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
    await refreshConversations()
    onLeft()
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Group settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-slate-700 dark:hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      <ScrollFade wrapperClassName="flex-1" className="space-y-5 p-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
            Group name
          </label>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && renameGroup()}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              onClick={renameGroup}
              disabled={busy || title.trim() === groupTitle || !title.trim()}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Members ({participantIds.length})
            </span>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1 text-xs font-bold text-cyan-500 hover:text-cyan-600"
            >
              <UserPlus size={12} /> Add
            </button>
          </div>

          {showAdd && (
            <div className="mb-3 rounded-xl border border-gray-100 p-2 dark:border-slate-700">
              {nonParticipants.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">All members are already in this group.</p>
              ) : nonParticipants.map(m => (
                <button
                  key={m.user_id}
                  onClick={() => addMember(m.user_id)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={24} />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{displayName(m)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-0.5">
            {participantMembers.map(m => (
              <div key={m.user_id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={28} />
                <span className="flex-1 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {displayName(m)}
                  {m.user_id === createdBy && (
                    <span className="ml-1 font-normal text-gray-400">creator</span>
                  )}
                </span>
                {m.user_id !== userId && isCreator && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    disabled={busy}
                    className="text-gray-300 transition-colors hover:text-red-400 disabled:opacity-40"
                    title={`Remove ${displayName(m)}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollFade>

      <div className="border-t border-gray-100 p-4 dark:border-slate-800">
        <button
          onClick={leaveGroup}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:hover:bg-red-950"
        >
          <LogOut size={14} /> Leave group
        </button>
      </div>
    </div>
  )
}
