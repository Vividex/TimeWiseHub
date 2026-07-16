'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AddTopicForm({ subjectId, yearGroup }: { subjectId: string; yearGroup: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in.'); setLoading(false); return }

    const { error: insertError } = await supabase.from('topics').insert({
      subject_id: subjectId,
      year_group: yearGroup,
      created_by: user.id,
      name: name.trim(),
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setOpen(false)
    setName('')
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
      >
        + Add topic
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-start gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <input
        autoFocus
        required
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Fractions"
        className="min-w-[10rem] flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(''); setError(null) }}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs font-semibold text-red-600">{error}</p>}
    </form>
  )
}
