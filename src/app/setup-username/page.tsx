'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { isUsernameTaken } from '@/lib/username'

export default function SetupUsernamePage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).maybeSingle()
      if (data?.username) {
        // Already has a username — skip this page
        router.replace('/dashboard')
        return
      }
      if (data?.full_name) setFullName(data.full_name)
      setLoadingProfile(false)
    }
    loadProfile()
  }, [router])

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

    const updates: Record<string, string> = { username: username.trim() }
    if (fullName.trim()) updates.full_name = fullName.trim()

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (updateError) {
      if (updateError.code === '23505' || updateError.message.toLowerCase().includes('unique')) {
        setUsernameError('Username already taken')
      } else {
        setError(updateError.message)
      }
      setLoading(false)
      return
    }

    const { data: memberships } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)

    const count = memberships?.length ?? 0
    if (count === 0) { router.push('/onboarding'); router.refresh(); return }
    if (count > 1) { router.push('/select-org'); router.refresh(); return }

    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: memberships![0].org_id }),
    })

    router.push('/dashboard')
    router.refresh()
  }

  if (loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">Almost there</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Complete your profile</h1>
        <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
          Just a couple of details and you&apos;re in.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">
              Full name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">
              Username
              <span className="ml-1 font-normal text-gray-400 text-xs">(unique, can&apos;t be changed later)</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={e => { setUsername(e.target.value); setUsernameError(null) }}
              onBlur={handleUsernameBlur}
              placeholder="jane_smith"
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
            className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Go to my dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
