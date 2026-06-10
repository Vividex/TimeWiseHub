// src/components/projects/TaskDrawer.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

export type DrawerTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
}

const STATUSES = ['todo', 'in_progress', 'done'] as const
const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export default function TaskDrawer({
  task,
  orgMembers,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: DrawerTask
  orgMembers?: { userId: string; displayName: string }[]
  onClose: () => void
  onSaved: (t: DrawerTask) => void
  onDeleted?: (id: string) => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState(task.status)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [assignee, setAssignee] = useState(task.assignee_id ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const updates = {
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      assignee_id: assignee || null,
      completed_at: status === 'done' ? (task.completed_at ?? new Date().toISOString()) : null,
    }
    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
    setSaving(false)
    if (error) return
    onSaved({ ...task, ...updates })
    router.refresh()
    onClose()
  }

  async function handleDelete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('id', task.id)
    router.refresh()
    onDeleted?.(task.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">Edit task</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Due date</label>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        {orgMembers && orgMembers.length > 0 && (
          <>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Assignee</label>
            <select value={assignee} onChange={e => setAssignee(e.target.value)}
              className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <option value="">Unassigned</option>
              {orgMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
            </select>
          </>
        )}

        <button onClick={save} disabled={saving || !title.trim()}
          className="mt-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="text-sm font-semibold text-red-400 hover:text-red-600">
              Delete task
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5 dark:bg-red-950">
              <p className="flex-1 text-sm font-semibold text-red-700 dark:text-red-300">Delete permanently?</p>
              <button type="button" onClick={handleDelete} disabled={saving}
                className="rounded-lg bg-red-500 px-3 py-1 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                {saving ? '…' : 'Yes, delete'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
