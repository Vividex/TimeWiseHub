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
  organisations: { name: string }
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [existingUser, setExistingUser] = useState(false)

  useEffect(() => {
    async function loadInvitation() {
      const supabase = createClient()

      const { data } = await supabase
        .from('invitations')
        .select('*, organisations(name)')
        .eq('token', token)
        .is('accepted_at', null)
        .single()

      if (!data) { setNotFound(true); setChecking(false); return }
      if (new Date(data.expires_at) < new Date()) { setExpired(true); setChecking(false); return }

      setInvitation(data as Invitation)

      // Check if user already has an account
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

    // Sign up or sign in
    if (!existingUser) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { account_type: 'personal' },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      if (signUpError) { setError(signUpError.message); setLoading(false); return }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Could not get user. Please try again.'); setLoading(false); return }

    // Add to org
    const { error: memberError } = await supabase
      .from('organisation_members')
      .insert({ org_id: invitation.org_id, user_id: user.id, role: invitation.role })

    if (memberError) { setError(memberError.message); setLoading(false); return }

    // Mark invitation accepted
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    router.push('/dashboard')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading invitation...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid invitation</h1>
          <p className="text-sm text-gray-500">This invite link is invalid or has already been used.</p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation expired</h1>
          <p className="text-sm text-gray-500">This invite link has expired. Ask your admin to send a new one.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">You've been invited</h1>
        <p className="text-sm text-gray-500 mb-6">
          Join <strong>{invitation?.organisations.name}</strong> as <strong>{invitation?.role}</strong>.
        </p>

        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={invitation?.email ?? ''}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>

          {!existingUser && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Choose a password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Joining...' : existingUser ? 'Join organisation' : 'Create account & join'}
          </button>
        </form>
      </div>
    </div>
  )
}
