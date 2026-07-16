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
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-900">Welcome to TimeWiseHub, {name}! 👋</h2>
          <p className="mt-1 text-sm font-semibold text-cyan-700">Get started in seconds — pick one of the quick actions below.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/time"
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-bold">
              Log your first time entry
            </Link>
            <Link href="/dashboard/projects"
              className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-50">
              Create a project
            </Link>
            <Link href="/help"
              className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-50">
              Browse help centre
            </Link>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-slate-400 hover:text-cyan-600 text-lg font-black">✕</button>
      </div>
    </div>
  )
}


