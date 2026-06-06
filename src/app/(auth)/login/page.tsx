'use client'

import { useState } from 'react'
import Image from 'next/image'
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
        <div className="w-full max-w-md">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">Welcome back</p>
          <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Sign in to TimeWiseHub</h1>

          <form onSubmit={handleLogin} className="space-y-5">
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
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <p>
              <Link href="/reset-password" className="font-semibold text-cyan-600 hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p className="font-medium text-gray-500 dark:text-slate-400">
              No account?{' '}
              <Link href="/register" className="font-semibold text-cyan-600 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
