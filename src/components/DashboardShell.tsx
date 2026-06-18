'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import SidebarNav from '@/components/nav/SidebarNav'
import MobileSidebar from '@/components/nav/MobileSidebar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/dashboard/time': 'Time tracking',
  '/dashboard/chat': 'Chat',
  '/dashboard/assistant': 'Assistant',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/clients': 'Clients',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/billing': 'Billing',
  '/dashboard/finance': 'Finance',
}

function getTitle(pathname: string) {
  if (pathname.includes('/projects/')) return 'Project'
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return 'Projects'
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname.startsWith('/dashboard/clients/')) return 'Client'
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}

function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

export default function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode
  email: string
}) {
  const pathname = usePathname()
  const title = getTitle(pathname)
  const isInvoicePrint = pathname.startsWith('/dashboard/invoices/') && pathname.endsWith('/print')

  if (isInvoicePrint) {
    return <div className="invoice-print-shell min-h-screen bg-white text-slate-900">{children}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto bg-slate-900 px-4 py-6 lg:flex">
        <SidebarNav email={email} />
      </aside>

      <div className="lg:pl-64">
        <header
          className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: '1rem' }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileSidebar email={email} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
                <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-sm">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}
