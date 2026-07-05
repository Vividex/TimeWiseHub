'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import LogoUpload from '@/components/LogoUpload'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const slug = slugify(name)

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

    const { error: memberError } = await supabase
      .from('organisation_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    setCreatedOrgId(org.id)
    setLoading(false)
  }

  if (createdOrgId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Add your company logo</h1>
          <p className="mb-8 text-sm font-medium text-gray-500">Optional — you can always add or change this in Settings.</p>

          <div className="space-y-8">
            <LogoUpload
              currentLogoUrl={null}
              storagePath={`${createdOrgId}/logo`}
              targetTable="organisations"
              targetId={createdOrgId}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { window.location.href = '/setup' }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/setup' }}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
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
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            {name && (
              <p className="mt-2 text-xs font-semibold text-gray-500">URL slug: {slugify(name)}</p>
            )}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create organisation'}
          </button>
        </form>
      </div>
    </div>
  )
}
