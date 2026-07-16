'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditSiteModal from './EditSiteModal'

type Site = {
  id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
}

export default function EditSiteButton({ site }: { site: Site }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 active:scale-[0.95] dark:border-slate-700 dark:text-slate-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && <EditSiteModal site={site} onClose={() => setOpen(false)} />}
    </>
  )
}
