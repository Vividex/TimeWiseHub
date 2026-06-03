'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const slug = slugify(name)

    // Create the organisation
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .insert({ name, slug })
      .select()
      .single()

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }

    // Add current user as owner
    const { error: memberError } = await supabase
      .from('organisation_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Set up your organisation</h1>
        <p className="mb-8 text-sm font-medium text-gray-500">You can invite team members after setup.</p>

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Organisation name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Vividex"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {name && (
              <p className="mt-2 text-xs font-semibold text-gray-500">URL slug: {slugify(name)}</p>
            )}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create organisation'}
          </button>
        </form>
      </div>
    </div>
  )
}
