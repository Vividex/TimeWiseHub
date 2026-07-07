'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AddSubSubjectForm({ parentSubjectId, orgId }: { parentSubjectId: string; orgId: string | null }) {
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

    const { error: insertError } = await supabase.from('subjects').insert({
      parent_subject_id: parentSubjectId,
      org_id: orgId,
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
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        + Add sub-subject
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
        placeholder="e.g. French"
        className="min-w-[10rem] flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(''); setError(null) }}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs font-semibold text-red-600">{error}</p>}
    </form>
  )
}
