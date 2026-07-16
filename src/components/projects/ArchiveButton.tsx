'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function ArchiveButton({ projectId, currentStatus }: { projectId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const supabase = createClient()
    const newStatus = currentStatus === 'active' ? 'archived' : 'active'
    await supabase.from('projects').update({ status: newStatus }).eq('id', projectId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button onClick={toggle} disabled={loading}
      className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
      {loading ? '...' : currentStatus === 'active' ? 'Move to outbox' : 'Restore to inbox'}
    </button>
  )
}

