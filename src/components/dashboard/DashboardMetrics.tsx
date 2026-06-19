import { Clock, FolderOpen, CheckSquare, Users } from 'lucide-react'

type Props = {
  hoursThisWeek: number
  activeProjects: number
  tasksThisWeek: number
  activeClients: number
}

type CardProps = {
  icon: React.ElementType
  value: string
  label: string
  iconClass: string
  glowClass: string
}

function MetricCard({ icon: Icon, value, label, iconClass, glowClass }: CardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${glowClass}`} />
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  )
}

export default function DashboardMetrics({ hoursThisWeek, activeProjects, tasksThisWeek, activeClients }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        icon={Clock}
        value={`${hoursThisWeek.toFixed(1)}h`}
        label="Hours this week"
        iconClass="bg-cyan-500/15 text-cyan-400"
        glowClass="bg-cyan-500"
      />
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label="Active projects"
        iconClass="bg-violet-500/15 text-violet-400"
        glowClass="bg-violet-500"
      />
      <MetricCard
        icon={CheckSquare}
        value={String(tasksThisWeek)}
        label="Tasks completed"
        iconClass="bg-emerald-500/15 text-emerald-400"
        glowClass="bg-emerald-500"
      />
      <MetricCard
        icon={Users}
        value={String(activeClients)}
        label="Active clients"
        iconClass="bg-amber-500/15 text-amber-400"
        glowClass="bg-amber-500"
      />
    </div>
  )
}
