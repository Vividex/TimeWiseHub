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
    <div className="relative flex flex-col h-screen bg-slate-950">
      {/* Video frame fills the screen */}
      <div ref={containerRef} className="relative flex-1" />

      {/* Leave button overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3">
        <button
          onClick={handleLeave}
          className="px-6 py-3 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600 transition-colors shadow-xl"
        >
          Leave call
        </button>
        {isCreator && (
          <button
            onClick={handleEndForEveryone}
            className="px-6 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-xl"
          >
            End for everyone
          </button>
        )}
      </div>
    </div>
  )
}
