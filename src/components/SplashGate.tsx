'use client'

import { useState, type ReactNode } from 'react'
import SplashScreen from './SplashScreen'

export default function SplashGate({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      {children}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
    </>
  )
}
