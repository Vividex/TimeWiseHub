'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Student = {
  id: string
  name: string
  subjects: string[]
  notes: string | null
}

export default function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(student.name)
  const [subjects, setSubjects] = useState<string[]>(student.subjects)
  const [newSubject, setNewSubject] = useState('')
  const [notes, setNotes] = useState(student.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
    const res = await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subjects, notes: notes || null }),
    })
    if (res.ok) {
      onClose()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to save')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit student</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Student name *</label>
            <input ref={firstRef} required type="text" value={name} onChange={e => setName(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subjects</label>
            {subjects.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {subjects.map(s => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                    {s}
                    <button type="button" onClick={() => removeSubject(s)} className="text-cyan-400 hover:text-cyan-700">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                className={inputCls} />
              <button type="button" onClick={addSubject}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className={`resize-none ${inputCls}`} />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
