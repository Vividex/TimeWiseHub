'use client'

import { useState } from 'react'
import TaskForm from './TaskForm'
import TaskList from './TaskList'

type Task = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
}

export default function TaskSection({
  projectId,
  assigneeId,
  initialTasks,
}: {
  projectId: string
  assigneeId: string
  initialTasks: Task[]
}) {
  const [tasks, setTasks] = useState(initialTasks)

  function handleAdd(task: Task) {
    setTasks(prev => [...prev, task])
  }

  return (
    <>
      <TaskForm projectId={projectId} assigneeId={assigneeId} onAdd={handleAdd} />
      <TaskList initialTasks={tasks} projectId={projectId} currentUserId={assigneeId} />
    </>
  )
}
