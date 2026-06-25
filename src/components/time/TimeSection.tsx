'use client'

import { useState } from 'react'
import TimerWidget from './TimerWidget'
import ManualEntryForm from './ManualEntryForm'
import TimeEntryList from './TimeEntryList'

type TimeEntry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  task_id: string | null
  tasks: { title: string } | null
}

type ActiveEntry = {
  id: string
  started_at: string
  ended_at: string | null
  description: string | null
  task_id: string | null
  project_id: string | null
}

export default function TimeSection({
  userId,
  initialEntries,
  activeEntry,
}: {
  userId: string
  initialEntries: TimeEntry[]
  activeEntry: ActiveEntry | null
}) {
  const [entries, setEntries] = useState(initialEntries)

  function handleAdd(entry: TimeEntry) {
    setEntries(prev => [entry, ...prev])
  }

  return (
    <>
      <TimerWidget activeEntry={activeEntry} onEntryCompleted={handleAdd} />
      <ManualEntryForm onAdd={handleAdd} />
      <TimeEntryList initialEntries={entries} userId={userId} />
    </>
  )
}
