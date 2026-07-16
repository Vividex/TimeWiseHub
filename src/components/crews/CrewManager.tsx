'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, Users2 } from 'lucide-react'

export type OrgMember = { userId: string; displayName: string; role: string }
export type CrewMemberRow = { userId: string; displayName: string }
export type CrewData = {
  id: string
  name: string
  managerId: string
  managerName: string
  members: CrewMemberRow[]
}

export default function CrewManager({
  initialCrews,
  orgMembers,
  isAdmin,
}: {
  initialCrews: CrewData[]
  orgMembers: OrgMember[]
  isAdmin: boolean
}) {
  const [crews, setCrews] = useState(initialCrews)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newManagerId, setNewManagerId] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editManagerId, setEditManagerId] = useState('')

  const [addMemberTo, setAddMemberTo] = useState<string | null>(null)
  const [addMemberId, setAddMemberId] = useState('')

  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const potentialManagers = orgMembers.filter(m =>
    ['manager', 'admin', 'owner'].includes(m.role)
  )

  async function createCrew() {
    if (!newName.trim() || !newManagerId) return
    setLoading('create')
    setError(null)
    const res = await fetch('/api/crews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), managerId: newManagerId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(null); return }
    const managerName = orgMembers.find(m => m.userId === newManagerId)?.displayName ?? newManagerId
    setCrews(prev => [...prev, { id: data.id, name: data.name, managerId: newManagerId, managerName, members: [] }])
    setNewName(''); setNewManagerId(''); setCreating(false); setLoading(null)
  }

  async function updateCrew(crewId: string) {
    setLoading(`edit-${crewId}`)
    setError(null)
    const body: Record<string, string> = {}
    if (editName.trim()) body.name = editName.trim()
    if (editManagerId) body.managerId = editManagerId
    const res = await fetch(`/api/crews/${crewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(null); return }
    const managerName = orgMembers.find(m => m.userId === editManagerId)?.displayName
    setCrews(prev => prev.map(c => c.id === crewId ? {
      ...c,
      name: editName.trim() || c.name,
      managerId: editManagerId || c.managerId,
      managerName: managerName ?? c.managerName,
    } : c))
    setEditingId(null); setLoading(null)
  }

  async function deleteCrew(crewId: string) {
    if (!confirm('Delete this crew? Members will be unassigned but no documents are deleted.')) return
    setLoading(`del-${crewId}`)
    setError(null)
    const res = await fetch(`/api/crews/${crewId}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error); setLoading(null); return }
    setCrews(prev => prev.filter(c => c.id !== crewId)); setLoading(null)
  }

  async function addMember(crewId: string) {
    if (!addMemberId) return
    setLoading(`add-${crewId}`)
    setError(null)
    const res = await fetch(`/api/crews/${crewId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addMemberId }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); setLoading(null); return }
    const member = orgMembers.find(m => m.userId === addMemberId)
    setCrews(prev => prev.map(c => c.id === crewId ? {
      ...c,
      members: [...c.members.filter(m => m.userId !== addMemberId),
        { userId: addMemberId, displayName: member?.displayName ?? addMemberId }],
    } : c))
    setAddMemberTo(null); setAddMemberId(''); setLoading(null)
  }

  async function removeMember(crewId: string, userId: string) {
    setLoading(`rm-${crewId}-${userId}`)
    const res = await fetch(`/api/crews/${crewId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error); setLoading(null); return }
    setCrews(prev => prev.map(c => c.id === crewId
      ? { ...c, members: c.members.filter(m => m.userId !== userId) } : c))
    setLoading(null)
  }

  if (crews.length === 0 && !creating && !isAdmin) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Users2 size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-semibold">No crews yet.</p>
        <p className="mt-1 text-xs">Ask an admin to create crews and assign you.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {crews.map(crew => {
        const isEditing = editingId === crew.id
        const isAddingMember = addMemberTo === crew.id
        const available = orgMembers.filter(m => !crew.members.some(cm => cm.userId === m.userId))

        return (
          <div key={crew.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            {isEditing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold focus:border-cyan-400 focus:outline-none"
                  placeholder="Crew name"
                />
                <select
                  value={editManagerId}
                  onChange={e => setEditManagerId(e.target.value)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                >
                  {potentialManagers.map(m => (
                    <option key={m.userId} value={m.userId}>{m.displayName}</option>
                  ))}
                </select>
                <button onClick={() => updateCrew(crew.id)} disabled={loading === `edit-${crew.id}`}
                  className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 p-2 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingId(null)}
                  className="rounded-xl border border-gray-200 p-2 text-gray-500 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.965]">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900">{crew.name}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-gray-400">Manager: {crew.managerName}</p>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => { setEditingId(crew.id); setEditName(crew.name); setEditManagerId(crew.managerId) }}
                      className="rounded-lg border border-transparent p-1.5 text-gray-400 transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 active:scale-[0.92]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteCrew(crew.id)} disabled={loading === `del-${crew.id}`}
                      className="rounded-lg border border-transparent p-1.5 text-red-300 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-[0.92] disabled:opacity-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {crew.members.length === 0 && (
                <p className="text-xs italic text-gray-400">No members yet</p>
              )}
              {crew.members.map(member => (
                <span key={member.userId}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {member.displayName}
                  {isAdmin && (
                    <button
                      onClick={() => removeMember(crew.id, member.userId)}
                      disabled={loading === `rm-${crew.id}-${member.userId}`}
                      className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-3">
                {isAddingMember ? (
                  <div className="flex items-center gap-2">
                    <select value={addMemberId} onChange={e => setAddMemberId(e.target.value)}
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none">
                      <option value="">Select member…</option>
                      {available.map(m => (
                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                      ))}
                    </select>
                    <button onClick={() => addMember(crew.id)}
                      disabled={!addMemberId || loading === `add-${crew.id}`}
                      className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-2 text-sm font-bold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
                      Add
                    </button>
                    <button onClick={() => { setAddMemberTo(null); setAddMemberId('') }}
                      className="rounded-xl border border-gray-200 p-2 text-gray-500 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.965]">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setAddMemberTo(crew.id); setAddMemberId('') }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 hover:text-cyan-700">
                    <Plus size={12} /> Add member
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {isAdmin && (
        creating ? (
          <div className="rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-50/40 p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">New crew</h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Crew name (e.g. Sales Team)"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createCrew()}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:border-cyan-400 focus:outline-none"
              />
              <select value={newManagerId} onChange={e => setNewManagerId(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none">
                <option value="">Assign manager…</option>
                {potentialManagers.map(m => (
                  <option key={m.userId} value={m.userId}>{m.displayName}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={createCrew}
                disabled={!newName.trim() || !newManagerId || loading === 'create'}
                className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
                {loading === 'create' ? 'Creating…' : 'Create crew'}
              </button>
              <button onClick={() => { setCreating(false); setNewName(''); setNewManagerId('') }}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.965]">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-4 text-sm font-bold text-gray-400 transition-colors hover:border-cyan-300 hover:text-cyan-600">
            <Plus size={16} /> New crew
          </button>
        )
      )}
    </div>
  )
}
