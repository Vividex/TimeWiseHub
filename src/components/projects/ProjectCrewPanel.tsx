'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { CrewMemberOption } from '@/types/project-crew'

export default function ProjectCrewPanel({
  projectId,
  crew,
  availableMembers,
  canManage,
}: {
  projectId: string
  crew: CrewMemberOption[]
  availableMembers: CrewMemberOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const [addingId, setAddingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addMember() {
    if (!addingId) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('project_members').insert({
      project_id: projectId,
      user_id: addingId,
    })
    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    setAddingId('')
    router.refresh()
  }

  async function removeMember(userId: string) {
    const supabase = createClient()
    await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Crew</h2>
      {crew.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">No crew added yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {crew.map(member => (
            <li key={member.userId} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{member.displayName}</p>
              {canManage && (
                <button onClick={() => removeMember(member.userId)} className="text-xs font-semibold text-gray-400 transition-colors hover:text-red-500">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && availableMembers.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <select
            value={addingId}
            onChange={e => setAddingId(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Add to crew…</option>
            {availableMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
          <button
            onClick={addMember}
            disabled={!addingId || saving}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
