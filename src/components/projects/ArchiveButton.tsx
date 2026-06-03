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
      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
      {loading ? '...' : currentStatus === 'active' ? 'Move to outbox' : 'Restore to inbox'}
    </button>
  )
}
