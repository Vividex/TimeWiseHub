// src/components/home/MyWork.tsx
'use client'

import { useState } from 'react'
import { Tile, TileGrid } from '@/components/ui/Tile'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'green'> = { todo: 'gray', in_progress: 'amber', done: 'green' }
const STATUS_LABEL: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }

export default function MyWork({
  myTasks,
  orgMembers,
}: {
  myTasks: (DrawerTask & { projectName: string | null; clientId: string | null })[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState(myTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">My tasks</h2>
      <TileGrid empty="Nothing assigned to you right now.">
        {tasks.map(t => (
          <Tile
            key={t.id}
            title={t.title}
            meta={[t.projectName ?? '', t.due_date ? `due ${new Date(t.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · ') || undefined}
            badge={{ label: STATUS_LABEL[t.status], tone: STATUS_TONE[t.status] }}
            onClick={() => setActive(t)}
          />
        ))}
      </TileGrid>
      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={u => setTasks(prev => prev.map(t => (t.id === u.id ? { ...t, ...u } : t)))}
          onDeleted={id => setTasks(prev => prev.filter(t => t.id !== id))}
        />
      )}
    </div>
  )
}
