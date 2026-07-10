'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import SidebarNav from '@/components/nav/SidebarNav'
import MobileSidebar from '@/components/nav/MobileSidebar'
import ScrollFade from '@/components/ui/ScrollFade'
import type { NavOverrides } from '@/lib/workspace-profiles/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/dashboard/time': 'Time tracking',
  '/dashboard/chat': 'Chat',
  '/dashboard/assistant': 'Assistant',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/billing': 'Billing',
  '/dashboard/finance': 'Finance',
  '/dashboard/programs': 'Programs',
}

function getTitle(pathname: string, clientLabel: { singular: string; plural: string }) {
  if (pathname.includes('/projects/')) return 'Project'
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return 'Projects'
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname === '/dashboard/clients') return clientLabel.plural
  if (pathname.startsWith('/dashboard/clients/')) return clientLabel.singular
  if (pathname.startsWith('/dashboard/programs/')) return 'Program'
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}

function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

export default function DashboardShell({
  children,
  email,
  clientLabel,
  navOverrides,
}: {
  children: React.ReactNode
  email: string
  clientLabel: { singular: string; plural: string }
  navOverrides?: NavOverrides
}) {
  const pathname = usePathname()
  const title = getTitle(pathname, clientLabel)
  const isInvoicePrint = pathname.startsWith('/dashboard/invoices/') && pathname.endsWith('/print')
  const isVideoRoom = /^\/dashboard\/video\/[^/]+/.test(pathname)

  if (isInvoicePrint) {
    return <div className="invoice-print-shell min-h-screen bg-white text-slate-900">{children}</div>
  }

  if (isVideoRoom) {
    return <div className="bg-slate-950">{children}</div>
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
        <ScrollFade wrapperClassName="flex-1" className="px-4 py-6" fadeFrom="from-slate-900">
          <SidebarNav email={email} clientLabel={clientLabel} navOverrides={navOverrides} />
        </ScrollFade>
      </aside>

      <div className="flex h-screen flex-col lg:pl-64">
        <header
          className="z-10 shrink-0 border-b border-gray-200 bg-white/95 px-4 backdrop-blur sm:px-8 dark:border-slate-800 dark:bg-slate-900/95"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: '1rem' }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileSidebar email={email} clientLabel={clientLabel} navOverrides={navOverrides} />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-500">TimeWiseHub</p>
                <h1 className="font-['Poppins'] text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-lg shadow-cyan-500/30">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <ScrollFade as="main" wrapperClassName="flex-1" fadeFrom="from-gray-50 dark:from-slate-950">
          {children}
        </ScrollFade>
      </div>
    </div>
  )
}
