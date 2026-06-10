// src/components/projects/ProjectTaskGrid.tsx
'use client'

import { useState } from 'react'
import { Tile, TileGrid } from '@/components/ui/Tile'
import TaskForm from '@/components/projects/TaskForm'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'green'> = {
  todo: 'gray', in_progress: 'amber', done: 'green',
}
const STATUS_LABEL: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }

function meta(task: DrawerTask): string {
  const parts = [task.priority]
  if (task.due_date) parts.push(`due ${new Date(task.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`)
  return parts.join(' · ')
}

export default function ProjectTaskGrid({
  projectId,
  assigneeId,
  initialTasks,
  orgMembers,
}: {
  projectId: string
  assigneeId: string
  initialTasks: DrawerTask[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState<DrawerTask[]>(initialTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  function handleAdd(task: DrawerTask) {
    setTasks(prev => [...prev, task])
  }
  function handleSaved(updated: DrawerTask) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }
  function handleDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-5">
      <TaskForm projectId={projectId} assigneeId={assigneeId} orgMembers={orgMembers} onAdd={handleAdd} />
      <TileGrid empty="No tasks yet. Add the first one.">
        {tasks.map(t => (
          <Tile
            key={t.id}
            title={t.title}
            meta={meta(t)}
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
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
