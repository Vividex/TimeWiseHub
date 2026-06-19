// src/components/nav/SidebarNav.tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
  TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
  MessageSquare, Sparkles, CalendarRange, Users2, Video, ScrollText, Network, type LucideIcon,
} from 'lucide-react'
import SignOutButton from '@/components/SignOutButton'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'
import { useTutorial } from '@/components/tutorial/TutorialProvider'

type NavItem = { label: string; href: string; icon: LucideIcon; tutorialId?: string }
type NavGroup = { title: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { title: 'Home', items: [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard, tutorialId: 'home' },
  ] },
  { title: 'Delivery', items: [
    { label: 'Clients', href: '/dashboard/clients', icon: Users, tutorialId: 'clients' },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
    { label: 'Time', href: '/dashboard/time', icon: Clock, tutorialId: 'time' },
  ] },
  { title: 'Communication', items: [
    { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare, tutorialId: 'chat' },
    { label: 'Video', href: '/dashboard/video', icon: Video },
    { label: 'Assistant', href: '/dashboard/assistant', icon: Sparkles, tutorialId: 'assistant' },
  ] },
  { title: 'Money', items: [
    { label: 'Quotes', href: '/dashboard/quotes', icon: ScrollText },
    { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
    { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
    { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
  ] },
  { title: 'People', items: [
    { label: 'Leave',   href: '/dashboard/leave',  icon: Palmtree },
    { label: 'Roster',  href: '/dashboard/roster', icon: CalendarRange, tutorialId: 'roster' },
    { label: 'Team',    href: '/dashboard/team',   icon: Users2 },
    { label: 'Crews',   href: '/dashboard/crews',  icon: Network },
  ] },
  { title: 'Insights', items: [
    { label: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
  ] },
]

export const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Download App', href: '/download', icon: Download },
  { label: 'Help', href: '/help', icon: HelpCircle },
  { label: 'Settings', href: '/settings', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') return pathname === '/settings'
  if (href === '/dashboard') return pathname === href
  return pathname.startsWith(href)
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  const unread = useChatUnreadTotal()
  const badge = item.href === '/dashboard/chat' && unread > 0 ? (unread > 99 ? '99+' : unread) : null
  const { activeTarget } = useTutorial()

  const isBlocked = !!activeTarget && item.tutorialId !== activeTarget
  const isSpotlit = !!activeTarget && item.tutorialId === activeTarget

  return (
    <Link
      href={item.href}
      data-tutorial={item.tutorialId}
      tabIndex={isBlocked ? -1 : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      } ${isBlocked ? 'pointer-events-none opacity-30' : ''} ${isSpotlit ? 'relative' : ''}`}
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

export default function SidebarNav({ email }: { email: string }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-col lg:flex-1">
      <Link href="/dashboard" className="mb-8 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm">
          <Image src="/logo.png" alt="TimeWiseHub" width={44} height={44} className="object-contain" />
        </div>
        <div className="min-w-0">
          <p className="font-['Poppins'] text-xl font-black tracking-tight text-white">TimeWiseHub</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Track Time. Control Costs. Grow Smarter.</p>
        </div>
      </Link>

      <nav className="space-y-0.5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
        {NAV_GROUPS.map(group => (
          <div key={group.title}>
            <p className="mt-6 mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.title}</p>
            {group.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </div>
        ))}
        <div className="my-3 border-t border-slate-800" />
        {BOTTOM_ITEMS.map(item =>
          item.href === '/download'
            ? <div key={item.href} className="hidden md:block"><NavLink item={item} pathname={pathname} /></div>
            : <NavLink key={item.href} item={item} pathname={pathname} />
        )}
      </nav>

      <div className="mt-4 rounded-xl bg-slate-800 p-3">
        <p className="truncate text-sm font-semibold text-white">{email}</p>
        <div className="mt-3"><SignOutButton /></div>
      </div>
      <p className="mt-4 text-center text-xs font-semibold tracking-wide text-slate-600">
        Powered by <span className="text-slate-400">Vividex</span>
      </p>
    </div>
  )
}
