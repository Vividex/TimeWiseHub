'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

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

export default function TaskForm({ projectId, assigneeId, onAdd }: { projectId: string; assigneeId: string; onAdd?: (task: Task) => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: task, error } = await supabase.from('tasks').insert({
      project_id: projectId,
      assignee_id: assigneeId,
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      notes: notes || null,
    }).select('id, title, priority, status, due_date, notes, assignee_id, completed_at').single()

    if (error) { setError(error.message); setLoading(false); return }

    setTitle('')
    setPriority('normal')
    setDueDate('')
    setNotes('')
    setExpanded(false)
    setLoading(false)
    if (task) onAdd?.(task as Task)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input type="text" placeholder="Add a task..." value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        <button type="submit" disabled={loading || !title.trim()}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
          Add
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 pl-1">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
    </form>
  )
}

