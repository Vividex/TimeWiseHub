'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid-cols-[1fr_1.05fr]">
        <div className="hidden bg-blue-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-black text-blue-600">T</div>
            <h1 className="text-4xl font-black tracking-tight">TimeWiseHub</h1>
            <p className="mt-4 text-lg font-semibold text-blue-100">Track time, projects, expenses, and deadlines from one focused workspace.</p>
          </div>
          <p className="text-sm font-semibold text-blue-100">Bold planning for teams that move fast.</p>
        </div>

        <div className="p-8 sm:p-10">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-600">Welcome back</p>
          <h1 className="mb-8 text-3xl font-black tracking-tight text-gray-900">Sign in to TimeWiseHub</h1>

        <form onSubmit={handleLogin} className="space-y-5">
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm">
          <p>
            <Link href="/reset-password" className="font-semibold text-blue-600 hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="font-medium text-gray-500">
            No account?{' '}
            <Link href="/register" className="font-semibold text-blue-600 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}
