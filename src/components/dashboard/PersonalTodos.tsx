'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, Plus } from 'lucide-react'
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

export default function PersonalTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
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

  const dayStart = startOfToday()
  const active   = todos.filter(t => !t.done)
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
        {visible.map((t, i) => (
          <button
            key={t.id}
            onClick={() => toggle(t)}
            className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-800/60 ${
              i < visible.length - 1 || archived.length > 0 ? 'border-b border-slate-800/60' : ''
            }`}
          >
            {t.done
              ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              : <Circle size={16} className="shrink-0 text-slate-600" />
            }
            <span className={`text-sm font-medium ${t.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
              {t.text}
            </span>
          </button>
        ))}

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
              <button
                key={t.id}
                onClick={() => toggle(t)}
                className="flex w-full items-center gap-3 border-t border-slate-800/60 px-5 py-3 text-left transition-colors hover:bg-slate-800/60"
              >
                <CheckCircle2 size={16} className="shrink-0 text-slate-700" />
                <span className="text-sm text-slate-600 line-through">{t.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
