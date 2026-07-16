'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteQuoteButton({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/invoices/${quoteId}`, { method: 'DELETE' })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="rounded-lg border border-transparent p-1.5 text-gray-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-[0.92] disabled:opacity-50 dark:hover:border-red-400/30 dark:hover:bg-red-500/10"
        title="Delete quote"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        title="Delete quote"
        message={`Permanently delete ${quoteNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
