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
      className="text-xs text-gray-400 hover:text-gray-700 underline disabled:opacity-50">
      {loading ? '...' : currentStatus === 'active' ? 'Move to outbox' : 'Restore to inbox'}
    </button>
  )
}
