'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

type AccountType = 'personal' | 'org_owner'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { account_type: accountType },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Check your email</h1>
          <p className="text-sm font-medium text-gray-500">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-600">TimeWiseHub</p>
        <h1 className="mb-8 text-3xl font-black tracking-tight text-gray-900">Create your account</h1>

        <form onSubmit={handleRegister} className="space-y-5">

          {/* Account type */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">I am signing up as</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountType('personal')}
                className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                  accountType === 'personal'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold">Personal</div>
                <div className="text-xs mt-0.5 font-normal opacity-75">Individual use</div>
              </button>
              <button
                type="button"
                onClick={() => setAccountType('org_owner')}
                className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                  accountType === 'org_owner'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold">Business</div>
                <div className="text-xs mt-0.5 font-normal opacity-75">I own or manage a team</div>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          By registering you agree to our{' '}
          <Link href="/terms" className="hover:underline">Terms</Link>
          {' and '}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
