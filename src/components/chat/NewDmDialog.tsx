'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'

export default function NewDmDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (conversationId: string) => void
}) {
  const { userId, members, refreshConversations } = useChat()
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const others = Object.values(members).filter(m => m.user_id !== userId)

  async function startDm(targetId: string) {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('start_dm', { p_target: targetId })
    if (error) { alert(error.message); setBusy(false); return }
    await refreshConversations()
    onStarted(data as string)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New message</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {others.length === 0 && (
            <p className="text-sm font-medium text-gray-400">No other members in your organisation yet.</p>
          )}
          {others.map(m => (
            <button
              key={m.user_id}
              onClick={() => startDm(m.user_id)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
                {displayName(m).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {displayName(m)}
                </span>
                <span className="block truncate text-xs font-medium capitalize text-gray-400">{m.role}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
