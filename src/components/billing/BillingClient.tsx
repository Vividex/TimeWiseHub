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
      className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
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
      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
      {loading ? 'Loading...' : 'Manage subscription'}
    </button>
  )
}

