'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

type Todo = {
  id: string
  text: string
  done: boolean
  done_at: string | null
  created_at: string
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function TodoRow({
  todo,
  hasBorder,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: Todo
  hasBorder: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-800/60 ${hasBorder ? 'border-b border-slate-800/60' : ''}`}>
      <button onClick={onToggle} className="shrink-0">
        {todo.done
          ? <CheckCircle2 size={16} className="text-emerald-400" />
          : <Circle size={16} className="text-slate-600 hover:text-slate-400 transition-colors" />
        }
      </button>
      <span className={`flex-1 text-sm font-medium ${todo.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
        {todo.text}
      </span>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!todo.done && (
          <button
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function EditRow({
  todo,
  hasBorder,
  onSave,
  onCancel,
}: {
  todo: Todo
  hasBorder: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(todo.text)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  function save() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== todo.text) onSave(trimmed)
    else onCancel()
  }

  return (
    <div className={`flex items-center gap-3 px-5 py-3 ${hasBorder ? 'border-b border-slate-800/60' : ''}`}>
      <Circle size={16} className="shrink-0 text-slate-600" />
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
        className="flex-1 bg-transparent text-sm font-medium text-slate-100 focus:outline-none"
      />
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={save}
          className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

export default function PersonalTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('personal_todos')
      .select('id, text, done, done_at, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTodos((data ?? []) as Todo[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    const { data } = await supabase
      .from('personal_todos')
      .insert({ text: trimmed })
      .select('id, text, done, done_at, created_at')
      .single()
    if (data) setTodos(prev => [data as Todo, ...prev])
    inputRef.current?.focus()
  }

  async function toggle(todo: Todo) {
    const done = !todo.done
    const done_at = done ? new Date().toISOString() : null
    await supabase.from('personal_todos').update({ done, done_at }).eq('id', todo.id)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done, done_at } : t))
  }

  async function save(id: string, newText: string) {
    setEditingId(null)
    await supabase.from('personal_todos').update({ text: newText }).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t))
  }

  async function remove(id: string) {
    await supabase.from('personal_todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const dayStart  = startOfToday()
  const active    = todos.filter(t => !t.done)
  const doneToday = todos.filter(t => t.done && t.done_at && t.done_at >= dayStart)
  const archived  = todos.filter(t => t.done && (!t.done_at || t.done_at < dayStart))
  const visible   = [...active, ...doneToday]

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">My to-dos</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">

        {/* Add input */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Plus size={15} className="shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add a to-do…"
            className="flex-1 bg-transparent text-sm font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
          />
          {text.trim() && (
            <button
              onClick={add}
              className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
            >
              Add
            </button>
          )}
        </div>

        {visible.length === 0 && archived.length === 0 && (
          <p className="px-5 py-4 text-sm text-slate-600">Nothing here yet — add something above.</p>
        )}

        {/* Active + done today */}
        {visible.map((t, i) => {
          const hasBorder = i < visible.length - 1 || archived.length > 0
          return editingId === t.id ? (
            <EditRow
              key={t.id}
              todo={t}
              hasBorder={hasBorder}
              onSave={newText => save(t.id, newText)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TodoRow
              key={t.id}
              todo={t}
              hasBorder={hasBorder}
              onToggle={() => toggle(t)}
              onEdit={() => setEditingId(t.id)}
              onDelete={() => remove(t.id)}
            />
          )
        })}

        {/* Archived (done before today) */}
        {archived.length > 0 && (
          <div>
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex w-full items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:text-slate-400"
            >
              <ChevronDown size={12} className={`transition-transform ${showArchived ? '' : '-rotate-90'}`} />
              Archived ({archived.length})
            </button>
            {showArchived && archived.map(t => (
              <div key={t.id} className="group flex items-center gap-3 border-t border-slate-800/60 px-5 py-3 transition-colors hover:bg-slate-800/60">
                <button onClick={() => toggle(t)} className="shrink-0">
                  <CheckCircle2 size={16} className="text-slate-700 hover:text-slate-500 transition-colors" />
                </button>
                <span className="flex-1 text-sm text-slate-600 line-through">{t.text}</span>
                <button
                  onClick={() => remove(t.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
