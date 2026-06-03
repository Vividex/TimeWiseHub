'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function TaskForm({ projectId, assigneeId }: { projectId: string; assigneeId: string }) {
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
    const { error } = await supabase.from('tasks').insert({
      project_id: projectId,
      assignee_id: assigneeId,
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      notes: notes || null,
    })

    if (error) { setError(error.message); setLoading(false); return }

    setTitle('')
    setPriority('normal')
    setDueDate('')
    setNotes('')
    setExpanded(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input type="text" placeholder="Add a task..." value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="submit" disabled={loading || !title.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
          Add
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 pl-1">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
    </form>
  )
}
