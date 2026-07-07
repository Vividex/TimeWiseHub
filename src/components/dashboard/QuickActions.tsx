import Link from 'next/link'
import { UserPlus, GraduationCap, CalendarClock, Clock, FileText } from 'lucide-react'

export default function QuickActions({ rosterManaged = false, showNewStudent = false }: { rosterManaged?: boolean; showNewStudent?: boolean }) {
  const actions = [
    { label: 'New Client',  href: '/dashboard/clients',      icon: UserPlus,      colours: 'text-cyan-600    dark:text-cyan-400    bg-cyan-500/10    hover:bg-cyan-500/20    border-cyan-500/20' },
    ...(showNewStudent ? [
      { label: 'New Student', href: '/dashboard/students',     icon: GraduationCap, colours: 'text-violet-600  dark:text-violet-400  bg-violet-500/10  hover:bg-violet-500/20  border-violet-500/20' },
    ] : []),
    { label: 'New Session',  href: '/dashboard/sessions',     icon: CalendarClock, colours: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20' },
    { label: rosterManaged ? 'Log Hours' : 'Start Timer', href: '/dashboard/time', icon: Clock, colours: 'text-amber-600   dark:text-amber-400   bg-amber-500/10   hover:bg-amber-500/20   border-amber-500/20' },
    { label: 'New Invoice', href: '/dashboard/invoices/new', icon: FileText,      colours: 'text-red-600     dark:text-red-400     bg-red-500/10     hover:bg-red-500/20     border-red-500/20' },
  ]

  return (
    <div>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {actions.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${a.colours}`}
          >
            <a.icon size={18} className="shrink-0" />
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
