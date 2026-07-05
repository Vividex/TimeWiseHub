'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteClientButton({ clientId, clientName, clientLabel }: { clientId: string; clientName: string; clientLabel: { singular: string; plural: string } }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleArchive() {
    setLoading(true)
    const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/dashboard/clients')
    } else {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Archive
      </button>

      <ConfirmDialog
        open={open}
        title={`Archive ${clientName}?`}
        message={`${clientName} will be removed from your active ${clientLabel.singular.toLowerCase()} list. All sessions, notes, and invoices are preserved — this is reversible via the database.`}
        confirmLabel={`Archive ${clientLabel.singular.toLowerCase()}`}
        onConfirm={handleArchive}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
