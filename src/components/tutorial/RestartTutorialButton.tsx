'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RestartTutorialButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch('/api/tutorial/start', { method: 'POST' })
    router.push('/dashboard')
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
    >
      {loading ? 'Restarting…' : 'Restart tutorial'}
    </button>
  )
}
