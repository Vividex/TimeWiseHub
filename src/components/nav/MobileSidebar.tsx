// src/components/nav/MobileSidebar.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import SidebarNav from '@/components/nav/SidebarNav'

export default function MobileSidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-gray-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 max-w-[80vw] flex-col bg-slate-900 px-4 py-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarNav email={email} />
          </aside>
        </div>
      )}
    </>
  )
}
