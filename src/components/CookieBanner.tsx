'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) setVisible(true)
  }, [])

  function accept() {
    localStorage.setItem('cookie_consent', 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-lg sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-gray-700">
          We use essential cookies to keep you signed in.{' '}
          <Link href="/cookies" className="text-cyan-600 hover:underline">Cookie Policy</Link>
          {' · '}
          <Link href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</Link>
        </p>
        <button onClick={accept}
          className="shrink-0 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600">
          Accept
        </button>
      </div>
    </div>
  )
}

