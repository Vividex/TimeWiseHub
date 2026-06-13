// src/components/FloatingWidgets.tsx
'use client'

import { useState } from 'react'
import { MessageSquare, Sparkles, X } from 'lucide-react'
import AssistantWidget from '@/components/AssistantWidget'
import TeamChatWidget from '@/components/chat/TeamChatWidget'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type OpenWidget = 'assistant' | 'chat' | null

function makeDragHandler(
  getPos: () => { x: number; y: number } | null,
  setPos: (p: { x: number; y: number }) => void,
) {
  return function handleHeaderPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a')) return
    const pos = getPos()
    if (!pos) return
    const startPos = { ...pos }
    const startMouse = { x: e.clientX, y: e.clientY }

    function onMove(ev: PointerEvent) {
      setPos({
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
}

export default function FloatingWidgets({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState<OpenWidget>(null)
  const [chatPos, setChatPos] = useState<{ x: number; y: number } | null>(null)
  const [assistantPos, setAssistantPos] = useState<{ x: number; y: number } | null>(null)
  const unread = useChatUnreadTotal()

  function toggle(widget: 'assistant' | 'chat') {
    const next = open === widget ? null : widget
    if (next === 'chat' && chatPos === null) {
      setChatPos({
        x: Math.max(16, window.innerWidth - 450),
        y: Math.max(16, window.innerHeight - 630),
      })
    }
    if (next === 'assistant' && assistantPos === null) {
      setAssistantPos({
        x: Math.max(16, window.innerWidth - 450),
        y: Math.max(16, window.innerHeight - 660),
      })
    }
    setOpen(next)
  }

  const handleChatHeaderPointerDown = makeDragHandler(
    () => chatPos,
    setChatPos,
  )

  const handleAssistantHeaderPointerDown = makeDragHandler(
    () => assistantPos,
    setAssistantPos,
  )

  return (
    <>
      {/* Chat window — independently positioned */}
      {open === 'chat' && chatPos && (
        <div style={{ position: 'fixed', left: chatPos.x, top: chatPos.y, zIndex: 50 }}>
          <TeamChatWidget onClose={() => setOpen(null)} onHeaderPointerDown={handleChatHeaderPointerDown} />
        </div>
      )}

      {/* Assistant window — independently positioned */}
      {open === 'assistant' && assistantPos && (
        <div style={{ position: 'fixed', left: assistantPos.x, top: assistantPos.y, zIndex: 50 }}>
          <AssistantWidget
            userEmail={userEmail}
            open={true}
            onClose={() => setOpen(null)}
            onHeaderPointerDown={handleAssistantHeaderPointerDown}
          />
        </div>
      )}

      {/* FAB button cluster — stays fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
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
