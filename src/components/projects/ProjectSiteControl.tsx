'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Site = { id: string; label: string }

export default function ProjectSiteControl({
  projectId,
  clientId,
  currentSiteId,
  currentSiteLabel,
}: {
  projectId: string
  clientId: string | null
  currentSiteId: string | null
  currentSiteLabel: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState(currentSiteId ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing || !clientId) return
    const supabase = createClient()
    supabase.from('client_sites').select('id, label').eq('client_id', clientId).eq('is_archived', false).order('label')
      .then(({ data }) => setSites(data ?? []))
  }, [editing, clientId])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('projects').update({ site_id: selectedSiteId || null }).eq('id', projectId)
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  if (!clientId) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-gray-500 dark:text-slate-400">Site:</span>
      {editing ? (
        <>
          <select
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— No site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={handleSave} disabled={saving} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setSelectedSiteId(currentSiteId ?? '') }} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-gray-700 dark:text-slate-300">{currentSiteLabel ?? 'No site assigned'}</span>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
            {currentSiteLabel ? 'Change' : 'Assign site'}
          </button>
        </>
      )}
    </div>
  )
}
