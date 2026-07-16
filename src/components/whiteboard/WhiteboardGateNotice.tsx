// src/components/whiteboard/WhiteboardGateNotice.tsx
import Link from 'next/link'
import { Lock } from 'lucide-react'

export default function WhiteboardGateNotice({ isGuest }: { isGuest: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 p-8 text-center">
      <Lock size={28} className="text-slate-500" />
      {isGuest ? (
        <p className="max-w-sm text-sm font-semibold text-slate-300">
          Whiteboard isn&apos;t available for this session.
        </p>
      ) : (
        <>
          <p className="max-w-sm text-sm font-semibold text-slate-300">
            Whiteboard is a Pro feature.
          </p>
          <Link
            href="/dashboard/billing"
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-bold"
          >
            Upgrade to unlock it →
          </Link>
        </>
      )}
    </div>
  )
}
