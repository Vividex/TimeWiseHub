'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { isUsernameTaken } from '@/lib/username'

export default function SetupUsernamePage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleUsernameBlur() {
    if (!username.trim()) return
    const taken = await isUsernameTaken(username.trim())
    setUsernameError(taken ? 'Username already taken' : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (usernameError) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', user.id)

    if (updateError) {
      // code 23505 = unique_violation
      if (updateError.code === '23505' || updateError.message.toLowerCase().includes('unique')) {
        setUsernameError('Username already taken')
      } else {
        setError(updateError.message)
      }
      setLoading(false)
      return
    }

    // Continue to org check (same logic as login page)
    const { data: memberships } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)

    const count = memberships?.length ?? 0

    if (count === 0) {
      router.push('/onboarding')
      router.refresh()
      return
    }

    if (count > 1) {
      router.push('/select-org')
      router.refresh()
      return
    }

    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: memberships![0].org_id }),
    })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Choose a username</h1>
        <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
          Your username is your unique identity on TimeWiseHub. You can set a display nickname later in settings.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => { setUsername(e.target.value); setUsernameError(null) }}
              onBlur={handleUsernameBlur}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {usernameError && (
              <p className="mt-1 text-xs font-semibold text-red-500">{usernameError}</p>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !!usernameError}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
