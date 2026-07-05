'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function StudentForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSubject() {
    const trimmed = newSubject.trim()
    if (!trimmed || subjects.includes(trimmed)) return
    setSubjects(prev => [...prev, trimmed])
    setNewSubject('')
  }

  function removeSubject(subject: string) {
    setSubjects(prev => prev.filter(s => s !== subject))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('students').insert({
      client_id: clientId,
      name,
      subjects,
      notes: notes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setName(''); setSubjects([]); setNewSubject(''); setNotes('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
        {open ? 'Cancel' : '+ Add student'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Student name *</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Emma"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subjects</label>
            {subjects.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {subjects.map(s => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {s}
                    <button type="button" onClick={() => removeSubject(s)} className="text-cyan-400 hover:text-cyan-700">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                placeholder="e.g. Year 10 Maths"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <button type="button" onClick={addSubject}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50">
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save student'}
          </button>
        </form>
      )}
    </div>
  )
}
