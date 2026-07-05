'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type ProgressNoteRow = {
  id: string
  body: string
  created_at: string
  created_by: string
  author: string
  student_id: string | null
  sent_to_parent_at: string | null
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProgressNotesList({
  notes,
  currentUserId,
  canManage,
  students,
  clientId,
}: {
  notes: ProgressNoteRow[]
  currentUserId: string
  canManage: boolean
  students: { id: string; name: string }[]
  clientId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [studentFilter, setStudentFilter] = useState('')
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  function startEdit(note: ProgressNoteRow) {
    setEditingId(note.id)
    setDraft(note.body)
    setError('')
  }

  async function saveEdit(id: string) {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Progress note cannot be empty.')
      return
    }

    setSavingId(id)
    setError('')
    const { error: err } = await supabase.from('progress_notes').update({ body: trimmed }).eq('id', id)
    setSavingId(null)

    if (err) {
      setError(err.message)
      return
    }

    setEditingId(null)
    setDraft('')
    router.refresh()
  }

  function toggleSelected(id: string) {
    setSelectedNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSendToParent() {
    const selected = notes.filter(n => selectedNoteIds.has(n.id))
    if (selected.length === 0) return
    setSending(true)
    setSendError('')

    const body = selected.map(n => n.body).join('\n\n')
    const studentIds = new Set(selected.map(n => n.student_id).filter(Boolean))
    const onlyStudentId = studentIds.size === 1 ? [...studentIds][0] : null
    const subject = onlyStudentId
      ? `Progress update for ${students.find(s => s.id === onlyStudentId)?.name ?? ''}`.trim()
      : 'Progress update'

    const res = await fetch(`/api/clients/${clientId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, subject, noteIds: [...selectedNoteIds] }),
    })

    setSending(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSendError(data.error ?? 'Failed to send')
      return
    }

    setSelectedNoteIds(new Set())
    router.refresh()
  }

  if (notes.length === 0) {
    return <p className="text-sm font-semibold text-gray-400">No notes yet.</p>
  }

  const filteredNotes = studentFilter ? notes.filter(n => n.student_id === studentFilter) : notes

  return (
    <div className="space-y-3">
      {students.length > 0 && (
        <select
          value={studentFilter}
          onChange={e => setStudentFilter(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">— All students —</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {selectedNoteIds.size > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSendToParent}
            disabled={sending}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-40"
          >
            {sending ? 'Sending…' : `Send ${selectedNoteIds.size} selected to parent`}
          </button>
          {sendError && <p className="text-xs font-semibold text-red-600">{sendError}</p>}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {filteredNotes.length === 0 && (
        <p className="text-sm font-semibold text-gray-400">No notes for this student yet.</p>
      )}

      {filteredNotes.map(note => {
        const canEdit = canManage || note.created_by === currentUserId
        const editing = editingId === note.id

        return (
          <div key={note.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                {note.sent_to_parent_at ? (
                  <span className="text-xs font-semibold text-green-600">Sent to parent on {fmtDateTime(note.sent_to_parent_at)}</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={selectedNoteIds.has(note.id)}
                    onChange={() => toggleSelected(note.id)}
                    className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
                  />
                )}
                <span className="text-xs font-bold text-gray-500">{note.author}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{fmtDateTime(note.created_at)}</span>
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="text-xs font-bold text-cyan-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(note.id)}
                    disabled={savingId === note.id || !draft.trim()}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-40"
                  >
                    {savingId === note.id ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setDraft(''); setError('') }}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-slate-300">{note.body}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
