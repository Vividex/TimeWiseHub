type LogEntry = {
  id: string
  event_type: string
  entity_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

function label(entry: LogEntry): string {
  const op = entry.event_type
  const meta = entry.metadata ?? {}

  switch (entry.entity_type) {
    case 'time_entries': {
      const dur = meta.duration_seconds as number | null
      const desc = meta.description as string | null
      const hrs = dur ? ` (${(dur / 3600).toFixed(1)}h)` : ''
      const what = desc ? ` — ${desc}` : ''
      if (op === 'INSERT') return `Started time entry${what}`
      if (op === 'DELETE') return `Deleted time entry${hrs}`
      return `Updated time entry${hrs}${what}`
    }
    case 'expenses': {
      const amt = meta.amount as string | null
      const cur = (meta.currency as string) ?? 'AUD'
      const status = meta.status as string | null
      const money = amt ? ` $${Number(amt).toFixed(2)} ${cur}` : ''
      if (op === 'INSERT') return `Logged expense${money}`
      if (op === 'DELETE') return `Deleted expense${money}`
      if (status) return `Expense ${status}${money}`
      return `Updated expense${money}`
    }
    case 'tasks': {
      const title = (meta.title as string) ?? 'task'
      const status = meta.status as string | null
      if (op === 'DELETE') return `Deleted task: ${title}`
      if (status === 'done') return `Completed task: ${title}`
      if (status === 'in_progress') return `Started task: ${title}`
      if (op === 'INSERT') return `Created task: ${title}`
      return `Updated task: ${title}`
    }
    case 'projects': {
      const name = (meta.name as string) ?? 'project'
      const status = meta.status as string | null
      if (op === 'INSERT') return `Created project: ${name}`
      if (status === 'archived') return `Archived project: ${name}`
      return `Updated project: ${name}`
    }
    default:
      return `${op.toLowerCase()} ${entry.entity_type.replace('_', ' ')}`
  }
}

function icon(entity: string): string {
  switch (entity) {
    case 'time_entries': return '🕐'
    case 'expenses':     return '💰'
    case 'tasks':        return '✅'
    case 'projects':     return '📁'
    default:             return '📋'
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ` ${time}`
}

export default function ActivityFeed({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm font-semibold text-gray-400">No activity recorded yet.</p>
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-100 bg-white text-base shadow-sm">
              {icon(entry.entity_type)}
            </div>
            {i < entries.length - 1 && <div className="mt-1 w-px flex-1 bg-gray-100" />}
          </div>
          <div className="pb-6 pt-1.5 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{label(entry)}</p>
            <p className="text-xs font-medium text-gray-400">{fmtTime(entry.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
