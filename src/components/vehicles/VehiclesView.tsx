'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Car } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
import { regoStatus, serviceStatus, STATUS_LABEL, STATUS_COLOUR } from '@/lib/vehicles'
import type { Vehicle } from '@/types/vehicles'

export type OrgMemberOption = { user_id: string; name: string }

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'ACT', 'NT', 'WA', 'TAS']

export default function VehiclesView({
  vehicles,
  orgId,
  members,
  canManage,
}: {
  vehicles: Vehicle[]
  orgId: string
  members: OrgMemberOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const { query, setQuery, filtered } = useTextFilter(vehicles, v => v.registration_number)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rego, setRego] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [state, setState] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [regoExpiryDate, setRegoExpiryDate] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')

  function resetForm() {
    setRego(''); setYear(''); setMake(''); setModel(''); setAssignedUserId('')
    setState(''); setRegoExpiryDate(''); setLookupError(null); setError(null)
  }

  async function lookupRego() {
    if (!rego.trim() || !state) return
    setLookingUp(true)
    setLookupError(null)

    const res = await fetch('/api/vehicles/lookup-rego', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: rego, state }),
    })
    const json = await res.json()

    setLookingUp(false)
    if (!res.ok) { setLookupError(json.error ?? 'Lookup failed.'); return }

    if (json.make) setMake(json.make)
    if (json.model) setModel(json.model)
    if (json.year) setYear(String(json.year))
    if (json.regoExpiryDate) setRegoExpiryDate(json.regoExpiryDate)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('vehicles').insert({
      org_id: orgId,
      registration_number: rego.trim().toUpperCase(),
      year: year ? parseInt(year, 10) : null,
      make: make.trim() || null,
      model: model.trim() || null,
      assigned_user_id: assignedUserId || null,
      state: state || null,
      rego_expiry_date: regoExpiryDate || null,
    })

    if (insertError) { setError(insertError.message); setSaving(false); return }

    resetForm()
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vehicles</h2>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Registration, servicing and costs feed straight into business expenses.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setOpen(v => !v)}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            {open ? 'Cancel' : '+ Add vehicle'}
          </button>
        )}
      </div>

      {open && canManage && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Registration *</label>
              <input required value={rego} onChange={e => setRego(e.target.value)} placeholder="ABC123"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">State</label>
              <select value={state} onChange={e => setState(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="">Select state</option>
                {AU_STATES.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={lookupRego} disabled={lookingUp || !rego.trim() || !state}
                className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition-colors hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
                {lookingUp ? 'Looking up…' : 'Look up'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</label>
              <input type="date" value={regoExpiryDate} onChange={e => setRegoExpiryDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          {lookupError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">{lookupError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Make</label>
              <input value={make} onChange={e => setMake(e.target.value)} placeholder="Toyota"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Model</label>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="Hilux"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Year</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2022"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Assigned to</label>
            <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <option value="">Unassigned</option>
              {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
            </select>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Create vehicle'}
          </button>
        </form>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="Search registration..." />

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-gray-500 dark:text-slate-400">No vehicles found.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {filtered.map(vehicle => {
            const rego = regoStatus(vehicle)
            const service = serviceStatus(vehicle)
            const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
            return (
              <Link
                key={vehicle.id}
                href={`/dashboard/vehicles/${vehicle.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                    <Car size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{vehicle.registration_number}</p>
                    <p className="truncate text-xs font-semibold text-gray-500 dark:text-slate-400">
                      {title || 'Vehicle details not set'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOUR[rego]}`}>
                    Rego {STATUS_LABEL[rego]}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOUR[service]}`}>
                    Service {STATUS_LABEL[service]}
                  </span>
                  {vehicle.current_odometer_km != null && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                      {vehicle.current_odometer_km.toLocaleString()} km
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
