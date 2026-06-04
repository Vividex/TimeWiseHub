'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Time', href: '/dashboard/time' },
  { label: 'Expenses', href: '/dashboard/expenses' },
  { label: 'Clients', href: '/dashboard/clients' },
  { label: 'Invoices', href: '/dashboard/invoices' },
  { label: 'Projects', href: '/dashboard/projects' },
  { label: 'Calendar', href: '/dashboard/calendar' },
  { label: 'Leave', href: '/dashboard/leave' },
  { label: 'Insights', href: '/dashboard/insights' },
  { label: 'Reports', href: '/dashboard/reports' },
  { label: 'Activity', href: '/dashboard/activity' },
  { label: 'Billing', href: '/dashboard/billing' },
  { label: 'Help', href: '/help' },
  { label: 'Settings', href: '/settings' },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/time': 'Time tracking',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/clients': 'Clients',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/projects': 'Projects',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/reports': 'Reports',
  '/dashboard/activity': 'Activity',
  '/dashboard/billing': 'Billing',
}

function getTitle(pathname: string) {
  if (pathname.startsWith('/dashboard/projects/')) return 'Project detail'
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

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-900 px-4 py-6 lg:flex">
        <Link href="/dashboard" className="mb-10 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-lg font-black text-white shadow-sm">
            T
          </div>
          <div className="min-w-0">
            <p className="font-['Poppins'] text-xl font-black tracking-tight text-white">TimeWiseHub</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Track Time. Control Costs. Grow Smarter.</p>
          </div>
        </Link>

        <nav className="space-y-1.5">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/settings'
              ? pathname === '/settings'
              : item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-cyan-400 bg-slate-800 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-xl bg-slate-800 p-3">
          <p className="truncate text-sm font-semibold text-white">{email}</p>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
              <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-slate-900">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-slate-900">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-sm">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-800 bg-slate-900 px-4 py-3 text-white lg:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {NAV_ITEMS.map(item => {
              const active = item.href === '/settings'
                ? pathname === '/settings'
                : item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <main>{children}</main>
      </div>
    </div>
  )
}
