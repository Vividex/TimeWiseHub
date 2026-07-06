'use client'

import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const [isDesktopApp, setIsDesktopApp] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsDesktopApp(isTauri())
  }, [])

  function cancelHide() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  function handleEnter() {
    cancelHide()
    setRevealed(true)
  }

  function handleLeave() {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setRevealed(false), 400)
  }

  if (!isDesktopApp) return null

  return (
    <>
      {/* Invisible trigger strip at the very top edge — hovering it reveals the bar below */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="fixed inset-x-0 top-0 z-[9999] h-1.5"
      />
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="fixed inset-x-0 top-0 z-[9999] flex h-9 items-center justify-between bg-slate-900 text-slate-200 transition-transform duration-150"
        style={{ transform: revealed ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div
          data-tauri-drag-region
          onDoubleClick={() => { getCurrentWindow().toggleMaximize() }}
          className="flex h-full flex-1 items-center gap-2 pl-3 text-xs font-semibold"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-4 w-4" data-tauri-drag-region />
          TimeWiseHub
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => { getCurrentWindow().minimize() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-slate-700"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => { getCurrentWindow().toggleMaximize() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-slate-700"
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={() => { getCurrentWindow().close() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-red-600"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  )
}
