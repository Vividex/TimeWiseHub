'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ExportButton from './ExportButton'
import ConfirmDialog from '@/components/ConfirmDialog'

type Entry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  task_id: string | null
  tasks: { title: string } | null
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function TimeEntryList({ initialEntries, userId }: { initialEntries: Entry[]; userId: string }) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])
  const [editDescription, setEditDescription] = useState('')

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setPendingDelete(null)
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setEditDescription(entry.description ?? '')
  }

  async function saveEdit(id: string) {
    const supabase = createClient()
    await supabase.from('time_entries').update({ description: editDescription || null }).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, description: editDescription || null } : e))
    setEditingId(null)
    router.refresh()
  }

  const completed = entries.filter(e => e.ended_at)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Today&apos;s entries</h2>
        <ExportButton userId={userId} />
      </div>

      {completed.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No completed entries yet today.</p>
      ) : (
        <ul className="space-y-3">
          {completed.map(entry => (
            <li key={entry.id} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex-1 min-w-0">
                {editingId === entry.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                    <button onClick={() => saveEdit(entry.id)} className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900">Cancel</button>
                  </div>
                ) : (
                  <p className="truncate text-sm font-semibold text-gray-900">{entry.description || <span className="italic text-gray-500">No description</span>}</p>
                )}
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {formatTime(entry.started_at)} – {entry.ended_at ? formatTime(entry.ended_at) : 'running'}
                  {entry.duration_seconds ? ` · ${formatDuration(entry.duration_seconds)}` : ''}
                </p>
                {entry.tasks && (
                  <p className="mt-1 text-xs font-semibold text-cyan-600">{entry.tasks.title}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => startEdit(entry)} className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900">Edit</button>
                <button onClick={() => setPendingDelete(entry.id)} className="text-xs font-semibold text-red-600 transition-colors hover:text-red-700">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete time entry"
        message="This entry will be permanently deleted and cannot be recovered."
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

