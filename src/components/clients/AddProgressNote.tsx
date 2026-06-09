'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AddProgressNote({
  clientId,
  orgId,
}: {
  clientId: string
  orgId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in.'); setSaving(false); return }

    const { error: err } = await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body: body.trim(),
    })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setBody('')
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Add a progress note…"
        rows={3}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
      />
      <button
        onClick={handleSave}
        disabled={saving || !body.trim()}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </div>
  )
}
