'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function DeleteProjectButton({ projectId, clientId }: { projectId: string; clientId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('projects').delete().eq('id', projectId)
    router.push(`/dashboard/clients/${clientId}/projects`)
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete project
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950">
      <p className="text-xs font-semibold text-red-700 dark:text-red-300">Delete permanently?</p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="rounded-lg bg-red-500 px-3 py-1 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
      >
        {loading ? 'Deleting…' : 'Yes, delete'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        Cancel
      </button>
    </div>
  )
}
