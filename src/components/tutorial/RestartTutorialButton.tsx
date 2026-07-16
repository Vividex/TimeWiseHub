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
      className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {loading ? 'Restarting…' : 'Restart tutorial'}
    </button>
  )
}
