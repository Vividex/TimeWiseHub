// src/components/FloatingWidgets.tsx
'use client'

import { useState } from 'react'
import { MessageSquare, Sparkles, X } from 'lucide-react'
import AssistantWidget from '@/components/AssistantWidget'
import TeamChatWidget from '@/components/chat/TeamChatWidget'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type OpenWidget = 'assistant' | 'chat' | null

export default function FloatingWidgets({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState<OpenWidget>(null)
  // null = not yet positioned; set on first open, persisted across open/close
  const [chatPos, setChatPos] = useState<{ x: number; y: number } | null>(null)
  const unread = useChatUnreadTotal()

  function toggle(widget: 'assistant' | 'chat') {
    const next = open === widget ? null : widget
    if (next === 'chat' && chatPos === null) {
      // Default: near bottom-right, offset so FAB buttons remain visible
      setChatPos({
        x: Math.max(16, window.innerWidth - 450),
        y: Math.max(16, window.innerHeight - 630),
      })
    }
    setOpen(next)
  }

  function handleHeaderPointerDown(e: React.PointerEvent) {
    // Don't initiate drag when clicking a button or link inside the header
    if ((e.target as HTMLElement).closest('button, a')) return
    if (!chatPos) return

    const startPos = { ...chatPos }
    const startMouse = { x: e.clientX, y: e.clientY }

    function onMove(ev: PointerEvent) {
      setChatPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, startPos.x + ev.clientX - startMouse.x)),
        y: Math.max(0, Math.min(window.innerHeight - 48, startPos.y + ev.clientY - startMouse.y)),
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  }

  return (
    <>
      {/* Chat window — independently positioned so it can be dragged anywhere */}
      {open === 'chat' && chatPos && (
        <div style={{ position: 'fixed', left: chatPos.x, top: chatPos.y, zIndex: 50 }}>
          <TeamChatWidget onClose={() => setOpen(null)} onHeaderPointerDown={handleHeaderPointerDown} />
        </div>
      )}

      {/* FAB button cluster — stays fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
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
    </>
  )
}
