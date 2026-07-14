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
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600"
          >
            Upgrade to unlock it →
          </Link>
        </>
      )}
    </div>
  )
}
