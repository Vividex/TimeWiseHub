'use client'

import { useState, type ReactNode } from 'react'
import SplashScreen from './SplashScreen'

export default function SplashGate({
  children,
  minDurationMs,
}: {
  children: ReactNode
  minDurationMs?: number
}) {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      {children}
      {showSplash && (
        <SplashScreen minDurationMs={minDurationMs} onDone={() => setShowSplash(false)} />
      )}
    </>
  )
}
