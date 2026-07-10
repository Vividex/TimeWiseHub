// src/components/nav/MobileSidebar.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import SidebarNav from '@/components/nav/SidebarNav'
import type { NavOverrides } from '@/lib/workspace-profiles/types'

export default function MobileSidebar({ email, clientLabel, navOverrides }: { email: string; clientLabel: { singular: string; plural: string }; navOverrides?: NavOverrides }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const navScrollRef = useRef<HTMLDivElement>(null)
  const [navAtTop, setNavAtTop] = useState(true)
  const [navAtBottom, setNavAtBottom] = useState(true)

  const updateNavFade = useCallback(() => {
    const el = navScrollRef.current
    if (!el) return
    setNavAtTop(el.scrollTop <= 2)
    setNavAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (open) updateNavFade()
  }, [open, updateNavFade])

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
          <aside className="relative z-10 h-screen w-72 max-w-[80vw] bg-slate-900">
            <div
              ref={navScrollRef}
              onScroll={updateNavFade}
              className="no-scrollbar h-full overflow-y-auto overscroll-contain px-4 pb-6"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              <SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />
            </div>
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-slate-900 to-transparent transition-opacity duration-150 ${navAtTop ? 'opacity-0' : 'opacity-100'}`}
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-900 to-transparent transition-opacity duration-150 ${navAtBottom ? 'opacity-0' : 'opacity-100'}`}
            />
          </aside>
        </div>
      )}
    </>
  )
}
