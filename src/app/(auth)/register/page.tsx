'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { isUsernameTaken } from '@/lib/username'

type AccountType = 'personal' | 'org_owner'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleUsernameBlur() {
    if (!username.trim()) return
    const taken = await isUsernameTaken(username.trim())
    setUsernameError(taken ? 'Username already taken' : null)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (usernameError) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { account_type: accountType, username: username.trim() },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('username')) {
        setUsernameError('Username already taken')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Check your email</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <div className="hidden min-h-screen w-1/2 bg-slate-900 px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md">
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden">
              <Image src="/logo.png" alt="TimeWiseHub" width={56} height={56} className="object-contain" />
            </div>
            <h1 className="font-['Poppins'] text-3xl font-black tracking-tight text-white">TimeWiseHub</h1>
            <p className="mt-3 text-sm font-semibold text-cyan-400">Track Time. Control Costs. Grow Smarter.</p>
            <ul className="mt-10 space-y-4 text-sm font-medium text-slate-300">
              <li>Log time with one click</li>
              <li>Track expenses and receipts</li>
              <li>Hit every project deadline</li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-500">Vividex</span>
        </p>
      </div>

      <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-slate-950 px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-xl">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Create your account</h1>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-200">I am signing up as</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType('personal')}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                    accountType === 'personal'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-500 hover:border-cyan-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">Personal</div>
                  <div className="mt-0.5 text-xs font-normal opacity-75">Individual use</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('org_owner')}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                    accountType === 'org_owner'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-500 hover:border-cyan-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">Business</div>
                  <div className="mt-0.5 text-xs font-normal opacity-75">I own or manage a team</div>
                </button>
              </div>
            </div>

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

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !!usernameError}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-gray-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-cyan-600 hover:underline">
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
    </div>
  )
}
