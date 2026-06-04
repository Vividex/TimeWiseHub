'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Time', href: '/dashboard/time' },
  { label: 'Expenses', href: '/dashboard/expenses' },
  { label: 'Projects', href: '/dashboard/projects' },
  { label: 'Calendar', href: '/dashboard/calendar' },
  { label: 'Insights', href: '/dashboard/insights' },
  { label: 'Activity', href: '/dashboard/activity' },
  { label: 'Billing', href: '/dashboard/billing' },
  { label: 'Help', href: '/help' },
  { label: 'Settings', href: '/settings' },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/time': 'Time tracking',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/projects': 'Projects',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/insights': 'Insights',
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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-gray-200 bg-white px-5 py-6 shadow-sm lg:flex lg:flex-col">
        <Link href="/dashboard" className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black text-white shadow-sm">
            T
          </div>
          <div>
            <p className="text-xl font-black tracking-tight text-gray-900">TimeWiseHub</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Work smarter</p>
          </div>
        </Link>

        <nav className="space-y-2">
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
                className={`flex items-center rounded-2xl border-l-4 px-4 py-3 text-sm font-bold transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p className="truncate text-sm font-semibold text-gray-900">{email}</p>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">TimeWiseHub</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-gray-900">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <div className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {NAV_ITEMS.map(item => {
              const active = item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:text-gray-900'
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
