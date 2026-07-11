'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Car, Gauge, NotebookText, ReceiptText, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { REVIEW_STATUS_COLOUR, REVIEW_STATUS_LABEL, type ReviewStatus } from '@/lib/expenses'
import { regoStatus, serviceStatus, STATUS_COLOUR, STATUS_LABEL } from '@/lib/vehicles'
import type { Vehicle, VehicleOdometerLog } from '@/types/vehicles'

export type OrgMemberOption = { user_id: string; name: string }
export type ExpenseCategoryOption = { id: string; name: string }

export type VehicleNote = {
  id: string
  vehicle_id: string
  note: string
  created_by: string | null
  created_at: string
}

export type VehicleExpense = {
  id: string
  org_id: string | null
  user_id: string
  category_id: string | null
  amount: number
  currency: string
  description: string | null
  expense_date: string
  receipt_path: string | null
  status: ReviewStatus
  expense_categories: { name: string } | null
}

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function displayDate(date: string | null) {
  if (!date) return 'Not set'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function vehicleTitle(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'
}

export default function VehicleDetailClient({
  vehicle: initialVehicle,
  odometerLogs: initialOdometerLogs,
  notes: initialNotes,
  expenses,
  members,
  categories,
  userId,
  canEdit,
  canDelete,
  canLog,
}: {
  vehicle: Vehicle
  odometerLogs: VehicleOdometerLog[]
  notes: VehicleNote[]
  expenses: VehicleExpense[]
  members: OrgMemberOption[]
  categories: ExpenseCategoryOption[]
  userId: string
  canEdit: boolean
  canDelete: boolean
  canLog: boolean
}) {
  const router = useRouter()
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [odometerLogs, setOdometerLogs] = useState(initialOdometerLogs)
  const [notes, setNotes] = useState(initialNotes)

  const [assignedUserId, setAssignedUserId] = useState(vehicle.assigned_user_id ?? '')
  const [nextServiceDueDate, setNextServiceDueDate] = useState(vehicle.next_service_due_date ?? '')
  const [nextServiceDueKm, setNextServiceDueKm] = useState(vehicle.next_service_due_km?.toString() ?? '')
  const [regoExpiryDate, setRegoExpiryDate] = useState(vehicle.rego_expiry_date ?? '')
  const [refreshingRego, setRefreshingRego] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [vehicleError, setVehicleError] = useState<string | null>(null)

  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const [odometerKm, setOdometerKm] = useState('')
  const [odometerNotes, setOdometerNotes] = useState('')
  const [drivenBy, setDrivenBy] = useState('')
  const [savingOdometer, setSavingOdometer] = useState(false)
  const [odometerError, setOdometerError] = useState<string | null>(null)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCurrency, setExpenseCurrency] = useState('AUD')
  const [expenseCategoryId, setExpenseCategoryId] = useState('')
  const [expenseDate, setExpenseDate] = useState(today())
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  const currentRegoStatus = regoStatus(vehicle)
  const currentServiceStatus = serviceStatus(vehicle)
  const assignedMember = members.find(member => member.user_id === vehicle.assigned_user_id)

  function authorName(createdBy: string | null) {
    if (!createdBy) return 'Unknown'
    if (createdBy === userId) return 'You'
    return members.find(member => member.user_id === createdBy)?.name ?? 'Team member'
  }

  async function saveAssignment(nextAssignedUserId: string) {
    setAssignedUserId(nextAssignedUserId)
    if (!canEdit) return

    setSavingVehicle(true)
    setVehicleError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('vehicles')
      .update({ assigned_user_id: nextAssignedUserId || null })
      .eq('id', vehicle.id)

    if (error) {
      setVehicleError(error.message)
      setAssignedUserId(vehicle.assigned_user_id ?? '')
      setSavingVehicle(false)
      return
    }

    setVehicle(prev => ({ ...prev, assigned_user_id: nextAssignedUserId || null }))
    setSavingVehicle(false)
    router.refresh()
  }

  async function saveVehicleDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) return

    setSavingVehicle(true)
    setVehicleError(null)

    const updates = {
      next_service_due_date: nextServiceDueDate || null,
      next_service_due_km: nextServiceDueKm ? parseInt(nextServiceDueKm, 10) : null,
      rego_expiry_date: regoExpiryDate || null,
    }

    const supabase = createClient()
    const { error } = await supabase.from('vehicles').update(updates).eq('id', vehicle.id)

    if (error) {
      setVehicleError(error.message)
      setSavingVehicle(false)
      return
    }

    setVehicle(prev => ({ ...prev, ...updates }))
    setSavingVehicle(false)
    router.refresh()
  }

  async function refreshRegoDetails() {
    if (!vehicle.state) {
      setRefreshError('Set a state on this vehicle before refreshing rego details.')
      return
    }
    setRefreshingRego(true)
    setRefreshError(null)

    const res = await fetch('/api/vehicles/lookup-rego', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: vehicle.registration_number, state: vehicle.state }),
    })
    const json = await res.json()

    setRefreshingRego(false)
    if (!res.ok) { setRefreshError(json.error ?? 'Lookup failed.'); return }

    if (json.regoExpiryDate) setRegoExpiryDate(json.regoExpiryDate)
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canLog) return

    const note = noteText.trim()
    if (!note) return

    setSavingNote(true)
    setNoteError(null)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('vehicle_notes')
      .insert({
        vehicle_id: vehicle.id,
        note,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) {
      setNoteError(error.message)
      setSavingNote(false)
      return
    }

    setNotes(prev => [data as VehicleNote, ...prev])
    setNoteText('')
    setSavingNote(false)
    router.refresh()
  }

  async function logOdometer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canLog) return

    setSavingOdometer(true)
    setOdometerError(null)

    const reading = parseInt(odometerKm, 10)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('log_vehicle_odometer', {
      p_vehicle_id: vehicle.id,
      p_odometer_km: reading,
      p_notes: odometerNotes.trim() || null,
      p_driven_by: drivenBy || null,
    })

    if (error) {
      setOdometerError(error.message)
      setSavingOdometer(false)
      return
    }

    const log = data as VehicleOdometerLog
    setOdometerLogs(prev => [log, ...prev])
    setVehicle(prev => ({ ...prev, current_odometer_km: reading }))
    setOdometerKm('')
    setOdometerNotes('')
    setDrivenBy('')
    setSavingOdometer(false)
    router.refresh()
  }

  async function logExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canLog) return

    setSavingExpense(true)
    setExpenseError(null)

    const supabase = createClient()
    let receiptPath: string | null = null

    if (expenseReceipt) {
      const ext = expenseReceipt.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, expenseReceipt)
      if (uploadError) {
        setExpenseError(uploadError.message)
        setSavingExpense(false)
        return
      }
      receiptPath = path
    }

    const { error } = await supabase.from('expenses').insert({
      user_id: userId,
      org_id: vehicle.org_id,
      is_business: true,
      vehicle_id: vehicle.id,
      category_id: expenseCategoryId || null,
      amount: parseFloat(expenseAmount),
      currency: expenseCurrency,
      description: expenseDescription.trim() || null,
      expense_date: expenseDate,
      receipt_path: receiptPath,
      status: 'submitted',
      is_recurring: false,
      recurrence_interval: null,
      next_billing_date: null,
    })

    if (error) {
      setExpenseError(error.message)
      setSavingExpense(false)
      return
    }

    setExpenseAmount('')
    setExpenseCurrency('AUD')
    setExpenseCategoryId('')
    setExpenseDate(today())
    setExpenseDescription('')
    setExpenseReceipt(null)
    setExpenseOpen(false)
    setSavingExpense(false)
    router.refresh()
  }

  async function archiveVehicle() {
    if (!canDelete) return
    if (!window.confirm(`Archive ${vehicle.registration_number}?`)) return

    const supabase = createClient()
    const { error } = await supabase
      .from('vehicles')
      .update({ is_archived: true })
      .eq('id', vehicle.id)

    if (error) {
      setVehicleError(error.message)
      return
    }

    router.push('/dashboard/vehicles')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/vehicles" className="text-sm font-bold text-cyan-600 hover:underline dark:text-cyan-400">
        Back to vehicles
      </Link>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <Car size={18} />
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{vehicle.registration_number}</h1>
                <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">{vehicleTitle(vehicle)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[currentRegoStatus]}`}>
                Rego: {STATUS_LABEL[currentRegoStatus]}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[currentServiceStatus]}`}>
                Service: {STATUS_LABEL[currentServiceStatus]}
              </span>
              {vehicle.current_odometer_km != null && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                  {vehicle.current_odometer_km.toLocaleString()} km
                </span>
              )}
            </div>
          </div>

          <div className="w-full max-w-sm space-y-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400">Assigned employee</label>
            {canEdit ? (
              <select
                value={assignedUserId}
                onChange={event => saveAssignment(event.target.value)}
                disabled={savingVehicle}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Unassigned</option>
                {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
              </select>
            ) : (
              <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {assignedMember?.name ?? 'Unassigned'}
              </p>
            )}
          </div>
        </div>

        {vehicleError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{vehicleError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Wrench size={18} className="text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Servicing and registration</h2>
          </div>

          {canEdit ? (
            <form onSubmit={saveVehicleDetails} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</label>
                  <input type="date" value={regoExpiryDate} onChange={event => setRegoExpiryDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <button type="button" onClick={refreshRegoDetails} disabled={refreshingRego}
                    className="mt-1.5 text-xs font-semibold text-cyan-600 hover:underline disabled:opacity-50 dark:text-cyan-400">
                    {refreshingRego ? 'Refreshing…' : 'Refresh rego details'}
                  </button>
                  {refreshError && <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">{refreshError}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Next service date</label>
                  <input type="date" value={nextServiceDueDate} onChange={event => setNextServiceDueDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Next service km</label>
                <input type="number" min="0" value={nextServiceDueKm} onChange={event => setNextServiceDueKm(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <button type="submit" disabled={savingVehicle} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                {savingVehicle ? 'Saving...' : 'Save vehicle details'}
              </button>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Rego expiry</dt>
                <dd className="font-bold text-gray-900 dark:text-slate-100">{displayDate(vehicle.rego_expiry_date)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Next service</dt>
                <dd className="font-bold text-gray-900 dark:text-slate-100">{displayDate(vehicle.next_service_due_date)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Next service km</dt>
                <dd className="font-bold text-gray-900 dark:text-slate-100">{vehicle.next_service_due_km?.toLocaleString() ?? 'Not set'}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Gauge size={18} className="text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Odometer log</h2>
          </div>

          {canLog && (
            <form onSubmit={logOdometer} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Odometer km</label>
                <input type="number" required min="0" value={odometerKm} onChange={event => setOdometerKm(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Notes</label>
                <input value={odometerNotes} onChange={event => setOdometerNotes(event.target.value)} placeholder="Optional"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Driven by (optional)</label>
                <select value={drivenBy} onChange={event => setDrivenBy(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Not specified</option>
                  {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
                </select>
              </div>
              {odometerError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{odometerError}</p>}
              <button type="submit" disabled={savingOdometer} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                {savingOdometer ? 'Saving...' : 'Log odometer'}
              </button>
            </form>
          )}

          {odometerLogs.length === 0 ? (
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No odometer readings yet.</p>
          ) : (
            <ul className="space-y-3">
              {odometerLogs.map(log => (
                <li key={log.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{log.odometer_km.toLocaleString()} km</p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                    {displayDate(log.logged_at)}{log.driven_by ? ` — driven by ${authorName(log.driven_by)}` : ''}
                  </p>
                  {log.notes && <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{log.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <NotebookText size={18} className="text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notes</h2>
        </div>

        {canLog && (
          <form onSubmit={addNote} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Add note</label>
              <textarea required value={noteText} onChange={event => setNoteText(event.target.value)} rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            {noteError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{noteError}</p>}
            <button type="submit" disabled={savingNote || !noteText.trim()} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {savingNote ? 'Saving...' : 'Add note'}
            </button>
          </form>
        )}

        {notes.length === 0 ? (
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map(note => (
              <li key={note.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-200">{note.note}</p>
                <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
                  {authorName(note.created_by)} · {new Date(note.created_at).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Linked expenses</h2>
          </div>
          {canLog && (
            <button onClick={() => setExpenseOpen(open => !open)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
              {expenseOpen ? 'Cancel' : '+ Log vehicle expense'}
            </button>
          )}
        </div>

        {expenseOpen && canLog && (
          <form onSubmit={logExpense} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Amount</label>
                <input type="number" required min="0.01" step="0.01" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Currency</label>
                <select value={expenseCurrency} onChange={event => setExpenseCurrency(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Category</label>
                <select value={expenseCategoryId} onChange={event => setExpenseCategoryId(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Uncategorised</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Date</label>
                <input type="date" required value={expenseDate} onChange={event => setExpenseDate(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Description</label>
              <input value={expenseDescription} onChange={event => setExpenseDescription(event.target.value)} placeholder="Fuel, service, tyres"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Receipt *</label>
              <input type="file" required accept="image/*,.pdf" onChange={event => setExpenseReceipt(event.target.files?.[0] ?? null)}
                className="w-full text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-600 hover:file:bg-cyan-100" />
            </div>
            {expenseError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{expenseError}</p>}
            <button type="submit" disabled={savingExpense} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {savingExpense ? 'Saving...' : 'Submit for approval'}
            </button>
          </form>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No expenses logged for this vehicle yet.</p>
        ) : (
          <ul className="space-y-3">
            {expenses.map(expense => (
              <li key={expense.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
                    {expense.currency} {expense.amount.toFixed(2)}
                    {expense.expense_categories && <span className="ml-2 text-xs font-semibold text-gray-500 dark:text-slate-400">{expense.expense_categories.name}</span>}
                  </p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${REVIEW_STATUS_COLOUR[expense.status]}`}>
                    {REVIEW_STATUS_LABEL[expense.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-slate-400">{displayDate(expense.expense_date)}</p>
                {expense.description && <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{expense.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canDelete && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 dark:border-red-500/20 dark:bg-red-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-red-700 dark:text-red-300">
                <Archive size={18} />
                Archive vehicle
              </h2>
              <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-300">
                Archiving hides this vehicle from active lists while preserving odometer and expense history.
              </p>
            </div>
            <button onClick={archiveVehicle} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
              Archive
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
