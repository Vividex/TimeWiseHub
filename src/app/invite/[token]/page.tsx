'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Invitation = {
  id: string
  org_id: string
  email: string
  role: string
  expires_at: string
  org_name: string
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [expired, setExpired] = useState(false)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [existingUser, setExistingUser] = useState(false)

  useEffect(() => {
    async function loadInvitation() {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`)

      if (response.status === 404) {
        setNotFound(true)
        setChecking(false)
        return
      }

      if (response.status === 410) {
        setExpired(true)
        setChecking(false)
        return
      }

      if (!response.ok) {
        setError('Could not load invitation. Please try again.')
        setChecking(false)
        return
      }

      const data = await response.json() as Invitation
      setInvitation(data)

      // Check if user already has an account
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setExistingUser(true)

      setChecking(false)
    }
    loadInvitation()
  }, [token])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation) return
    setLoading(true)
    setError(null)

    const supabase = createClient()

    if (existingUser) {
      // Already signed in — just add to org
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in first.'); setLoading(false); return }

      const { error: memberError } = await supabase
        .from('organisation_members')
        .insert({ org_id: invitation.org_id, user_id: user.id, role: invitation.role })

      if (memberError) { setError(memberError.message); setLoading(false); return }

      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
    } else {
      // New user — create account server-side (bypasses email confirmation)
      const res = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, fullName }),
      })

      const data = await res.json() as { email?: string; error?: string }
      if (!res.ok) { setError(data.error ?? 'Could not create account'); setLoading(false); return }

      // Sign in with the newly created credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      })
      if (signInError) { setError(signInError.message); setLoading(false); return }

      // New users never have a username — send them through profile setup first
      router.push('/setup-username')
      router.refresh()
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm font-semibold text-gray-500">Loading invitation...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-900">Invalid invitation</h1>
          <p className="text-sm font-medium text-gray-500">This invite link is invalid or has already been used.</p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-900">Invitation expired</h1>
          <p className="text-sm font-medium text-gray-500">This invite link has expired. Ask your admin to send a new one.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">You&apos;ve been invited</h1>
        <p className="mb-8 text-sm font-medium text-gray-500">
          Join <strong>{invitation?.org_name}</strong> as <strong>{invitation?.role}</strong>.
        </p>

        <form onSubmit={handleAccept} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Email</label>
            <input
              type="email"
              value={invitation?.email ?? ''}
              disabled
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          {!existingUser && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">Your name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">Choose a password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Joining...' : existingUser ? 'Join organisation' : 'Create account & sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
