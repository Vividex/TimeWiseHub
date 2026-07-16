// src/components/FloatingWidgets.tsx
'use client'

import { useState, useEffect } from 'react'
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
  const [isMobile, setIsMobile] = useState(false)
  const unread = useChatUnreadTotal()

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 640) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function toggle(widget: 'assistant' | 'chat') {
    const next = open === widget ? null : widget
    if (next === 'chat' && chatPos === null && !isMobile) {
      setChatPos({
        x: Math.max(16, window.innerWidth - 450),
        y: Math.max(16, window.innerHeight - 630),
      })
    }
    if (next === 'assistant' && assistantPos === null && !isMobile) {
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
      {/* Chat window */}
      {open === 'chat' && (isMobile || chatPos) && (
        isMobile ? (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(null) }}
          >
            <TeamChatWidget onClose={() => setOpen(null)} />
          </div>
        ) : (
          <div style={{ position: 'fixed', left: chatPos!.x, top: chatPos!.y, zIndex: 50 }}>
            <TeamChatWidget onClose={() => setOpen(null)} onHeaderPointerDown={handleChatHeaderPointerDown} />
          </div>
        )
      )}

      {/* Assistant window */}
      {open === 'assistant' && (isMobile || assistantPos) && (
        isMobile ? (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(null) }}
          >
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
            />
          </div>
        ) : (
          <div style={{ position: 'fixed', left: assistantPos!.x, top: assistantPos!.y, zIndex: 50 }}>
            <AssistantWidget
              userEmail={userEmail}
              open={true}
              onClose={() => setOpen(null)}
              onHeaderPointerDown={handleAssistantHeaderPointerDown}
            />
          </div>
        )
      )}

      {/* FAB button cluster — stays fixed bottom-right, clear of nav bar */}
      <div
        className="fixed right-5 z-50 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Chat button (top) */}
        <button
          type="button"
          onClick={() => toggle('chat')}
          className="relative flex h-[50px] w-[50px] items-center justify-center rounded-full bg-slate-700 text-white shadow-lg transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          aria-label="Open team chat"
        >
          <MessageSquare size={20} />
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
          className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
          aria-label="Open AI assistant"
        >
          {open === 'assistant'
            ? <X size={20} />
            : <Sparkles size={22} />}
        </button>
      </div>
    </>
  )
}
