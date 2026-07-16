'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleArchive() {
    setLoading(true)
    const res = await fetch(`/api/students/${studentId}`, { method: 'DELETE' })
    setOpen(false)
    if (res.ok) {
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.95] disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Archive
      </button>

      <ConfirmDialog
        open={open}
        title={`Archive ${studentName}?`}
        message={`${studentName} will be removed from the active student list. Existing sessions are preserved.`}
        confirmLabel="Archive student"
        onConfirm={handleArchive}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
