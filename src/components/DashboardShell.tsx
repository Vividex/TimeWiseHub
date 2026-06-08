'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Clock, FolderKanban, ListTodo, CalendarDays, Palmtree,
  Receipt, Users, FileText, TrendingUp,
  BarChart3, FileBarChart2, Activity,
  CreditCard, Download, HelpCircle, Settings, MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import SignOutButton from '@/components/SignOutButton'
import ThemeToggle from '@/components/ThemeToggle'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavGroup = { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Work',
    items: [
      { label: 'Time', href: '/dashboard/time', icon: Clock },
      { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
      { label: 'Tasks', href: '/dashboard/tasks', icon: ListTodo },
      { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare },
      { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
      { label: 'Leave', href: '/dashboard/leave', icon: Palmtree },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
      { label: 'Clients', href: '/dashboard/clients', icon: Users },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
      { label: 'Reports', href: '/dashboard/reports', icon: FileBarChart2 },
      { label: 'Activity', href: '/dashboard/activity', icon: Activity },
    ],
  },
]

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Download App', href: '/download', icon: Download },
  { label: 'Help', href: '/help', icon: HelpCircle },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/time': 'Time tracking',
  '/dashboard/tasks': 'Tasks',
  '/dashboard/chat': 'Chat',
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
  '/dashboard/finance': 'Finance',
}

function getTitle(pathname: string) {
  if (pathname.startsWith('/dashboard/projects/')) return 'Project detail'
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}

function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') return pathname === '/settings'
  if (href === '/dashboard') return pathname === href
  return pathname.startsWith(href)
}

function NavLink({ item, pathname, mobile }: { item: NavItem; pathname: string; mobile?: boolean }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  const unread = useChatUnreadTotal()
  const badge = item.href === '/dashboard/chat' && unread > 0 ? (unread > 99 ? '99+' : unread) : null

  if (mobile) {
    return (
      <Link
        href={item.href}
        className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Icon size={15} className="shrink-0" />
        {item.label}
        {badge && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </Link>
    )
  }
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-cyan-400 bg-slate-800 text-cyan-400'
          : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {item.label}
      {badge && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
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
  const allItems = [...NAV_GROUPS.flatMap(g => g.items), ...BOTTOM_ITEMS]

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-900 px-4 py-6 lg:flex overflow-y-auto">
        <Link href="/dashboard" className="mb-8 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl overflow-hidden shadow-sm">
            <Image src="/logo.png" alt="TimeWiseHub" width={44} height={44} className="object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-['Poppins'] text-xl font-black tracking-tight text-white">TimeWiseHub</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Track Time. Control Costs. Grow Smarter.</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-0.5">
          {NAV_GROUPS.map(group => (
            <div key={group.title}>
              <p className="mt-6 mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {group.title}
              </p>
              {group.items.map(item => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}

          <div className="my-3 border-t border-slate-800" />

          {BOTTOM_ITEMS.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="mt-4 rounded-xl bg-slate-800 p-3">
          <p className="truncate text-sm font-semibold text-white">{email}</p>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-400">Vividex</span>
        </p>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
              <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
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

        <div className="border-b border-slate-800 bg-slate-900 px-4 py-3 text-white lg:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {allItems.map(item => (
              <NavLink key={item.href} item={item} pathname={pathname} mobile />
            ))}
            <div className="shrink-0 flex items-center">
              <SignOutButton />
            </div>
          </nav>
        </div>

        <main>{children}</main>
      </div>
    </div>
  )
}
