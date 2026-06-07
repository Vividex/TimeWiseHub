'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function SplashScreen({
  minDurationMs = 1500,
  onDone,
}: {
  minDurationMs?: number
  onDone?: () => void
}) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setFading(true), minDurationMs)

    return () => clearTimeout(t)
  }, [minDurationMs])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      onTransitionEnd={(e) => {
        if (fading && e.propertyName === 'opacity') onDone?.()
      }}
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-3xl font-extrabold tracking-normal sm:text-4xl">
          <span>TimeWise</span>
          <span className="text-cyan-500 dark:text-cyan-400">Hub</span>
        </h1>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500 dark:text-cyan-400" aria-hidden="true" />
      </div>
    </div>
  )
}
