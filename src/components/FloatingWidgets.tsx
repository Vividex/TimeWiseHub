'use client'

import { useState } from 'react'
import { MessageSquare, Sparkles, X } from 'lucide-react'
import AssistantWidget from '@/components/AssistantWidget'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type OpenWidget = 'assistant' | 'chat' | null

export default function FloatingWidgets({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState<OpenWidget>(null)
  const unread = useChatUnreadTotal()

  function toggle(widget: 'assistant' | 'chat') {
    setOpen(prev => (prev === widget ? null : widget))
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open === 'chat' && (
        <div className="mb-1 flex h-[min(560px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="text-base font-black">Team Chat</h2>
              <a href="/dashboard/chat" className="text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Open full chat →
              </a>
            </div>
            <button onClick={() => setOpen(null)} className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">✕</button>
          </div>
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            Loading chat…
          </div>
        </div>
      )}

      {open === 'assistant' && (
        <AssistantWidget userEmail={userEmail} open={true} onClose={() => setOpen(null)} />
      )}

      {/* Chat button (top) */}
      <button
        type="button"
        onClick={() => toggle('chat')}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-white shadow-lg transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        aria-label="Open team chat"
      >
        <MessageSquare size={22} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Assistant button (bottom) */}
      <button
        type="button"
        onClick={() => toggle('assistant')}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open AI assistant"
      >
        {open === 'assistant' ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  )
}
