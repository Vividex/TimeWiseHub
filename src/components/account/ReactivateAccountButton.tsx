'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReactivateAccountButton() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reactivate() {
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/account/reactivate', { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to reactivate account.')
      setSubmitting(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={reactivate}
        disabled={submitting}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-5 py-2.5 text-sm font-bold disabled:opacity-50"
      >
        {submitting ? 'Reactivating…' : 'Reactivate account'}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  )
}
