'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import SessionProgramLink from '@/components/clients/SessionProgramLink'
import SessionRecurrence from '@/components/clients/SessionRecurrence'
import type { SessionSeriesInfo } from '@/lib/sessions/series'
import type { LinkedProgramBundle } from '@/types/programs'

type Todo = { id: string; title: string; completed: boolean; position: number }
type Status = 'scheduled' | 'in_progress' | 'completed'

const STATUS_NEXT: Record<Status, Status | null> = {
  scheduled: 'in_progress',
  in_progress: 'completed',
  completed: null,
}
const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}
const STATUS_STYLE: Record<Status, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SessionDetailClient({
  session: initial,
  todos: initialTodos,
  clientId,
  clientName,
  orgId,
  linkedProgram,
  series,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
  series: SessionSeriesInfo | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [title, setTitle] = useState(initial.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt.slice(0, 16))
  const [duration, setDuration] = useState(initial.durationMinutes)
  const [status, setStatus] = useState<Status>(initial.status)
  const [notes, setNotes] = useState(initial.notes)
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [newTodo, setNewTodo] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [savingProgressNote, setSavingProgressNote] = useState(false)
  const [progressNoteSaved, setProgressNoteSaved] = useState(false)
  const [progressNoteError, setProgressNoteError] = useState('')
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false)
  const [deletingSession, setDeletingSession] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNotes = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await supabase.from('sessions').update({ notes: value }).eq('id', initial.id)
    }, 800)
  }, [supabase, initial.id])

  function handleNotesChange(value: string) {
    setNotes(value)
    saveNotes(value)
  }

  async function saveTitle() {
    setEditingTitle(false)
    const trimmed = title.trim()
    if (!trimmed || trimmed === initial.title) return
    await supabase.from('sessions').update({ title: trimmed }).eq('id', initial.id)
  }

  async function saveSchedule(newAt: string, newDur: number) {
    await supabase.from('sessions').update({
      scheduled_at: new Date(newAt).toISOString(),
      duration_minutes: newDur,
    }).eq('id', initial.id)
  }

  async function advanceStatus() {
    const next = STATUS_NEXT[status]
    if (!next) return
    const { error } = await supabase.from('sessions').update({ status: next }).eq('id', initial.id)
    if (!error) setStatus(next)
  }

  async function toggleTodo(todo: Todo) {
    const newCompleted = !todo.completed
    await supabase.from('session_todos').update({ completed: newCompleted }).eq('id', todo.id)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: newCompleted } : t))
  }

  async function addTodo() {
    const trimmed = newTodo.trim()
    if (!trimmed) return
    const position = todos.length > 0 ? Math.max(...todos.map(t => t.position)) + 1 : 0
    const { data } = await supabase
      .from('session_todos')
      .insert({ session_id: initial.id, title: trimmed, completed: false, position })
      .select('id, title, completed, position')
      .single()
    if (data) {
      setTodos(prev => [...prev, data])
      setNewTodo('')
    }
  }

  async function deleteTodo(id: string) {
    await supabase.from('session_todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  async function moveTodo(id: string, dir: -1 | 1) {
    const idx = todos.findIndex(t => t.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= todos.length) return
    const updated = [...todos]
    const aPos = updated[idx].position
    const bPos = updated[swapIdx].position
    updated[idx] = { ...updated[idx], position: bPos }
    updated[swapIdx] = { ...updated[swapIdx], position: aPos }
    updated.sort((a, b) => a.position - b.position)
    setTodos(updated)
    await Promise.all([
      supabase.from('session_todos').update({ position: bPos }).eq('id', updated[swapIdx].id),
      supabase.from('session_todos').update({ position: aPos }).eq('id', updated[idx].id),
    ])
  }

  async function saveAsTemplate() {
    setSavingTemplate(true)
    await supabase.from('client_session_templates').delete().eq('client_id', clientId)
    if (todos.length > 0) {
      await supabase.from('client_session_templates').insert(
        todos.map(t => ({ client_id: clientId, title: t.title, position: t.position }))
      )
    }
    setSavingTemplate(false)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2000)
  }

  async function addSessionNotesToProgressNotes() {
    const trimmed = notes.trim()
    if (!trimmed) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    setSavingProgressNote(true)
    setProgressNoteSaved(false)
    setProgressNoteError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setProgressNoteError('Not logged in.')
      setSavingProgressNote(false)
      return
    }

    await supabase.from('sessions').update({ notes: trimmed }).eq('id', initial.id)

    const body = [
      `Session: ${title.trim() || initial.title}`,
      `Scheduled: ${fmtDateTime(new Date(scheduledAt).toISOString())}`,
      '',
      trimmed,
    ].join('\n')

    const { error } = await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body,
    })

    setSavingProgressNote(false)
    if (error) {
      setProgressNoteError(error.message)
      return
    }

    setProgressNoteSaved(true)
    setTimeout(() => setProgressNoteSaved(false), 2500)
  }

  async function deleteSession() {
    setDeletingSession(true)
    await supabase.from('sessions').delete().eq('id', initial.id)
    router.push(`/dashboard/clients/${clientId}/sessions`)
  }

  const allDone = todos.length > 0 && todos.every(t => t.completed)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${clientId}`} className="text-sm font-semibold text-cyan-600 hover:underline">
          {'←'} {clientName}
        </Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => e.key === 'Enter' && saveTitle()}
                  autoFocus
                  className="text-2xl font-black text-gray-900 w-full border-b-2 border-cyan-400 focus:outline-none bg-transparent"
                />
              ) : (
                <h1
                  onClick={() => setEditingTitle(true)}
                  className="text-2xl font-black text-gray-900 cursor-pointer hover:text-cyan-600 transition-colors"
                  title="Click to edit"
                >
                  {title}
                </h1>
              )}
              <div className="mt-2 flex flex-wrap gap-4 items-center text-sm text-gray-500">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => { setScheduledAt(e.target.value); saveSchedule(e.target.value, duration) }}
                  className="border-b border-gray-200 bg-transparent text-sm focus:border-cyan-400 focus:outline-none"
                />
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">Duration</span>
                  <input
                    type="number"
                    value={duration}
                    onChange={e => { setDuration(Number(e.target.value)); saveSchedule(scheduledAt, Number(e.target.value)) }}
                    min={5}
                    max={480}
                    className="w-16 border-b border-gray-200 bg-transparent text-center text-sm focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-gray-400">min</span>
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SessionProgramLink sessionId={initial.id} orgId={orgId} linkedProgram={linkedProgram} />
              <SessionRecurrence sessionId={initial.id} series={series} clientId={clientId} />
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              {STATUS_NEXT[status] && (
                <button
                  onClick={advanceStatus}
                  className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Mark as {STATUS_LABEL[STATUS_NEXT[status]!]}
                </button>
              )}
              {!confirmDeleteSession ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSession(true)}
                  className="rounded-xl border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-1.5">
                  <span className="text-xs font-semibold text-red-700">Delete permanently?</span>
                  <button
                    type="button"
                    onClick={deleteSession}
                    disabled={deletingSession}
                    className="rounded-lg bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {deletingSession ? '…' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSession(false)}
                    className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Checklist</h2>
              <button
                onClick={saveAsTemplate}
                disabled={savingTemplate || todos.length === 0}
                className="text-xs font-semibold text-cyan-600 hover:underline disabled:opacity-40"
              >
                {templateSaved ? 'Saved!' : savingTemplate ? 'Saving...' : 'Save as template'}
              </button>
            </div>

            {allDone && status !== 'completed' && (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                All items done! Ready to mark this session as Completed.
              </div>
            )}

            <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {todos.map((todo, i) => (
                <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo)}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                  <span className={`flex-1 text-sm ${todo.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {todo.title}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => moveTodo(todo.id, -1)} disabled={i === 0}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">{'↑'}</button>
                    <button onClick={() => moveTodo(todo.id, 1)} disabled={i === todos.length - 1}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">{'↓'}</button>
                    <button onClick={() => deleteTodo(todo.id)}
                      className="rounded px-1 text-red-400 hover:text-red-600">{'✕'}</button>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-2 bg-gray-50 px-4 py-3 dark:bg-slate-950 sm:flex-row sm:items-center">
                <input
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="Add item..."
                  className="min-h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={addTodo}
                  disabled={!newTodo.trim()}
                  className="min-h-10 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Notes</h2>
              <button
                type="button"
                onClick={addSessionNotesToProgressNotes}
                disabled={savingProgressNote || !notes.trim()}
                className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {savingProgressNote ? 'Adding...' : progressNoteSaved ? 'Added!' : 'Add to progress notes'}
              </button>
            </div>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Session notes..."
              rows={14}
              className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-700 shadow-sm focus:border-cyan-400 focus:outline-none resize-none"
            />
            {progressNoteError && <p className="text-xs font-semibold text-red-600">{progressNoteError}</p>}
            <p className="text-xs text-gray-400">Auto-saved as you type.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
