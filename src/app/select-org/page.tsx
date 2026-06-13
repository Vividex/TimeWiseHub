'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type OrgOption = {
  org_id: string
  role: string
  name: string
}

export default function SelectOrgPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('organisation_members')
        .select('org_id, role, organisations!organisation_members_org_id_fkey(name)')
        .eq('user_id', user.id)

      setOrgs(
        ((data ?? []) as unknown as {
          org_id: string
          role: string
          organisations: { name: string } | null
        }[]).map(row => ({
          org_id: row.org_id,
          role: row.role,
          name: row.organisations?.name ?? 'Unknown organisation',
        }))
      )
      setLoading(false)
    }
    load()
  }, [router])

  async function select(orgId: string) {
    setSelecting(orgId)
    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  if (loading) return null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Select organisation</h1>
        <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
          You belong to multiple organisations. Choose which one to open.
        </p>
        <div className="space-y-3">
          {orgs.map(org => (
            <button
              key={org.org_id}
              onClick={() => select(org.org_id)}
              disabled={!!selecting}
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 text-left transition-colors hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{org.name}</p>
                <p className="text-xs font-medium capitalize text-gray-500 dark:text-slate-400">{org.role}</p>
              </div>
              {selecting === org.org_id && (
                <span className="text-xs font-semibold text-cyan-500">Opening…</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
