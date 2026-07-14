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
        className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {submitting ? 'Reactivating…' : 'Reactivate account'}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  )
}
