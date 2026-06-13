'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function NicknameForm({
  username,
  initialNickname,
}: {
  username: string
  initialNickname: string
}) {
  const [nickname, setNickname] = useState(initialNickname)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() || null })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Username</label>
        <p className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-600 dark:text-slate-400">
          {username}
        </p>
        <p className="mt-1 text-xs text-gray-400">Your unique handle — contact support to change it.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">
          Nickname{' '}
          <span className="font-normal text-gray-400">(shown to others in chat and tasks)</span>
        </label>
        <input
          type="text"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder={username}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <p className="mt-1 text-xs text-gray-400">Leave blank to display your username instead.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save nickname'}
      </button>
    </form>
  )
}
