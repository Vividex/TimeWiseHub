'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Plan } from '@/lib/stripe'

export function UpgradeButton({ plan, seats = 1, label }: { plan: Plan; seats?: number; label: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, seats }),
    })
    const { url, error } = await res.json()
    if (error) { setLoading(false); return }
    router.push(url)
  }

  return (
    <button onClick={handleClick} disabled={loading}
      className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-3 text-sm font-bold disabled:opacity-50">
      {loading ? 'Redirecting...' : label}
    </button>
  )
}

export function ManageButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { setLoading(false); return }
    router.push(url)
  }

  return (
    <button onClick={handleClick} disabled={loading}
      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50">
      {loading ? 'Loading...' : 'Manage subscription'}
    </button>
  )
}

