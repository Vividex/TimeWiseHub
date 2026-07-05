'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditStudentModal from './EditStudentModal'

type Student = {
  id: string
  name: string
  notes: string | null
}

export default function EditStudentButton({ student }: { student: Student }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && <EditStudentModal student={student} onClose={() => setOpen(false)} />}
    </>
  )
}
