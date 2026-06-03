'use client'

import { useState } from 'react'
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Check your email</h1>
          <p className="text-sm font-medium text-gray-500">
            We sent a password reset link to <strong>{email}</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Reset your password</h1>
        <p className="mb-8 text-sm font-medium text-gray-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={handleReset} className="space-y-5">
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

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-gray-500">
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
