'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-browser'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Password updated</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Taking you to your dashboard…</p>
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
          </div>
        </div>
        <p className="text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-500">Vividex</span>
        </p>
      </div>

      <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-slate-950 px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Set a new password</h1>
          <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
            Choose a new password for your account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Confirm password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
