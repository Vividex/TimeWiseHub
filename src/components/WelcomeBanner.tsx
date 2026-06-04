'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function WelcomeBanner({ firstName }: { firstName: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('welcome_dismissed')) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem('welcome_dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  const name = firstName || 'there'

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-black text-blue-900">Welcome to TimeWiseHub, {name}! 👋</h2>
          <p className="mt-1 text-sm font-semibold text-blue-700">Get started in seconds — pick one of the quick actions below.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/time"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700">
              Log your first time entry
            </Link>
            <Link href="/dashboard/projects"
              className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50">
              Create a project
            </Link>
            <Link href="/help"
              className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50">
              Browse help centre
            </Link>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-blue-400 hover:text-blue-600 text-lg font-black">✕</button>
      </div>
    </div>
  )
}
