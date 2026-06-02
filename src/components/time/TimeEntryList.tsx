'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ExportButton from './ExportButton'

type Entry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
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
  const [editDescription, setEditDescription] = useState('')

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
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
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Today's entries</h2>
        <ExportButton userId={userId} />
      </div>

      {completed.length === 0 ? (
        <p className="text-sm text-gray-400">No completed entries yet today.</p>
      ) : (
        <ul className="space-y-3">
          {completed.map(entry => (
            <li key={entry.id} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1 min-w-0">
                {editingId === entry.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={() => saveEdit(entry.id)} className="text-xs text-blue-600 hover:underline">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 truncate">{entry.description || <span className="text-gray-400 italic">No description</span>}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatTime(entry.started_at)} – {entry.ended_at ? formatTime(entry.ended_at) : 'running'}
                  {entry.duration_seconds ? ` · ${formatDuration(entry.duration_seconds)}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => startEdit(entry)} className="text-xs text-gray-400 hover:text-gray-700">Edit</button>
                <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
