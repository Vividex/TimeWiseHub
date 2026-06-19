'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DailyIframe from '@daily-co/daily-js'

type Props = {
  roomUrl: string
  token: string
  dailyRoomName: string
  isCreator: boolean
}

export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!containerRef.current) return

    const frame = DailyIframe.createFrame(containerRef.current, {
      showLeaveButton: false,
      showFullscreenButton: true,
      iframeStyle: {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        border: 'none',
      },
    })

    frame.join({ url: roomUrl, token })
    frameRef.current = frame

    frame.on('left-meeting', () => {
      router.push('/dashboard/video')
    })

    return () => {
      frame.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLeave() {
    frameRef.current?.leave()
  }

  async function handleEndForEveryone() {
    await fetch(`/api/video/rooms/${dailyRoomName}`, { method: 'DELETE' })
    frameRef.current?.leave()
  }

  return (
    <div
      className="relative flex flex-col bg-slate-950"
      style={{ height: '100dvh' }}
    >
      {/* Daily.co iframe fills all remaining space */}
      <div ref={containerRef} className="relative flex-1 min-h-0" />

      {/* Controls bar — always visible at the bottom, never overlapping the iframe */}
      <div
        className="flex shrink-0 items-center justify-center gap-3 bg-slate-900 px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={handleLeave}
          className="px-6 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition-colors shadow-lg"
        >
          Leave call
        </button>
        {isCreator && (
          <button
            onClick={handleEndForEveryone}
            className="px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-lg"
          >
            End for everyone
          </button>
        )}
      </div>
    </div>
  )
}
