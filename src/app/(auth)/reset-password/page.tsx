'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/update-password`,
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Check your email</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            We sent a password reset link to <strong>{email}</strong>.
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
        <div className="w-full max-w-md">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Reset your password</h1>
          <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <form onSubmit={handleReset} className="space-y-5">
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

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-gray-500 dark:text-slate-400">
            <Link href="/login" className="font-semibold text-cyan-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
