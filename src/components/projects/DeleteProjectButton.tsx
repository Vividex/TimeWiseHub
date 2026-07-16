'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteProjectButton({ projectId, clientId }: { projectId: string; clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('projects').delete().eq('id', projectId)
    router.push(`/dashboard/clients/${clientId}/projects`)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="rounded-xl border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-500 hover:bg-red-50 active:scale-[0.965] disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Delete project
      </button>
      <ConfirmDialog
        open={open}
        title="Delete project?"
        message="This will permanently delete the project and cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
