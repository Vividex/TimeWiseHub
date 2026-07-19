'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteSwmsDocumentButton({
  documentId,
  storagePath,
  documentName,
  clientId,
  projectId,
}: {
  documentId: string
  storagePath: string
  documentName: string
  clientId: string
  projectId: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.storage.from('project-swms').remove([storagePath])
    await supabase.from('project_swms_documents').delete().eq('id', documentId)
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}`)
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={deleting}
        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:bg-slate-900 dark:hover:bg-red-500/10"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete SWMS document"
        message={`"${documentName}" will be permanently deleted and crew will lose access to it.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
