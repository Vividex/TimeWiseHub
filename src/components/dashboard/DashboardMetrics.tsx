'use client'

import Link from 'next/link'
import { CalendarClock, FolderOpen, CheckSquare, Users, AlertTriangle } from 'lucide-react'

type Props = {
  sessionsThisWeek: number
  activeProjects: number
  tasksCompleted: number
  tasksTotal: number
  activeClients: number
  overdueTotal: number
  overdueCurrency: string
}

type CardProps = {
  icon: React.ElementType
  value: string
  label: string
  iconClass: string
  glowClass: string
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never })

function MetricCard({ icon: Icon, value, label, iconClass, glowClass, href, onClick }: CardProps) {
  const inner = (
    <>
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${glowClass}`} />
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500">{label}</p>
    </>
  )

  const cls = 'relative block overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60 text-left w-full'

  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button onClick={onClick} className={cls}>{inner}</button>
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const header = document.querySelector('header')
  const offset = (header?.offsetHeight ?? 72) + 16
  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top, behavior: 'smooth' })
}

export default function DashboardMetrics({ sessionsThisWeek, activeProjects, tasksCompleted, tasksTotal, activeClients, overdueTotal, overdueCurrency }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <MetricCard
        icon={CalendarClock}
        value={String(sessionsThisWeek)}
        label="Sessions this week"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/sessions"
      />
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label="Active projects"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/projects"
      />
      <MetricCard
        icon={CheckSquare}
        value={`${tasksCompleted}/${tasksTotal}`}
        label="Tasks complete"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        onClick={() => scrollTo('my-tasks')}
      />
      <MetricCard
        icon={Users}
        value={String(activeClients)}
        label="Active clients"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/clients"
      />
      <MetricCard
        icon={AlertTriangle}
        value={`${overdueCurrency} ${overdueTotal.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        label="Overdue invoices"
        iconClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
        glowClass="bg-cyan-500"
        href="/dashboard/invoices?overdue=1"
      />
    </div>
  )
}
