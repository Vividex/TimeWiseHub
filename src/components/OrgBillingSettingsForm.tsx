'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
import { normaliseInvoicePaymentDetails, type InvoicePaymentDetails } from '@/lib/invoice-payment-details'

type OrgMember = {
  id: string
  role: string
  hourly_rate: number | null
  profiles: { email: string; full_name: string | null } | null
}

export default function OrgBillingSettingsForm({
  orgId,
  initialRoundingMinutes,
  initialPayCadence,
  initialSuperRate,
  initialPayWeekStartDay,
  initialOrgName,
  initialInvoiceLetterhead,
  initialInvoicePaymentDetails,
  canEditInvoiceLetterhead,
  initialMembers,
}: {
  orgId: string
  initialRoundingMinutes: number
  initialPayCadence: string
  initialSuperRate: number
  initialPayWeekStartDay: number
  initialOrgName: string
  initialInvoiceLetterhead: string
  initialInvoicePaymentDetails: InvoicePaymentDetails
  canEditInvoiceLetterhead: boolean
  initialMembers: OrgMember[]
}) {
  const router = useRouter()
  const [roundingEnabled, setRoundingEnabled] = useState(initialRoundingMinutes === 15)
  const [payCadence, setPayCadence] = useState(initialPayCadence)
  const [superRate, setSuperRate] = useState(String(initialSuperRate))
  const [payWeekStartDay, setPayWeekStartDay] = useState(initialPayWeekStartDay)
  const [invoiceLetterhead, setInvoiceLetterhead] = useState(initialInvoiceLetterhead)
  const [paymentDetails, setPaymentDetails] = useState<InvoicePaymentDetails>(() => normaliseInvoicePaymentDetails(initialInvoicePaymentDetails))
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialMembers.map(member => [member.id, member.hourly_rate?.toString() ?? ''])),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { query, setQuery, filtered: filteredMembers } = useTextFilter(
    initialMembers,
    m => `${m.profiles?.full_name ?? ''} ${m.profiles?.email ?? ''} ${m.role}`,
  )

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const { error: orgError } = await supabase
      .from('organisations')
      .update({
        time_rounding_minutes: roundingEnabled ? 15 : 0,
        pay_cadence: payCadence,
        super_rate: superRate.trim() ? Number(superRate) : 12,
        pay_week_start_day: payWeekStartDay,
        invoice_payment_details: paymentDetails,
        ...(canEditInvoiceLetterhead ? { invoice_letterhead: invoiceLetterhead.trim() || null } : {}),
      })
      .eq('id', orgId)

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }

    const updates = initialMembers.map(member => {
      const rate = rates[member.id]?.trim()
      return supabase
        .from('organisation_members')
        .update({ hourly_rate: rate ? Number(rate) : null })
        .eq('id', member.id)
    })

    const results = await Promise.all(updates)
    const updateError = results.find(result => result.error)?.error

    if (updateError) {
      setError(updateError.message)
    } else {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 3000)
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">Organisation</p>
        <h2 className="mt-1 text-xl font-bold text-gray-900">Billable rates &amp; time rounding</h2>
        <p className="mt-1 text-sm font-semibold text-gray-500">Set employee hourly rates and optionally round time entries to the nearest 15 minutes.</p>
      </div>

      {canEditInvoiceLetterhead && (
        <div>
          <label htmlFor="invoiceLetterhead" className="block text-sm font-bold text-gray-900">Invoice letterhead</label>
          <input
            id="invoiceLetterhead"
            type="text"
            value={invoiceLetterhead}
            onChange={e => setInvoiceLetterhead(e.target.value)}
            placeholder={initialOrgName || 'Organisation name'}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <p className="mt-1 text-xs font-medium text-gray-500">
            Leave blank to use {initialOrgName || 'your organisation name'} on team invoices.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-bold text-gray-900">Invoice payment details</p>
          <p className="text-xs font-medium text-gray-500">Automatically included on organisation invoices.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Account name</label>
          <input
            type="text"
            value={paymentDetails.account_name ?? ''}
            onChange={e => setPaymentDetails(prev => ({ ...prev, account_name: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">BSB</label>
            <input
              type="text"
              value={paymentDetails.bsb ?? ''}
              onChange={e => setPaymentDetails(prev => ({ ...prev, bsb: e.target.value }))}
              placeholder="000-000"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Account number</label>
            <input
              type="text"
              value={paymentDetails.account_number ?? ''}
              onChange={e => setPaymentDetails(prev => ({ ...prev, account_number: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">PayID</label>
          <input
            type="text"
            value={paymentDetails.pay_id ?? ''}
            onChange={e => setPaymentDetails(prev => ({ ...prev, pay_id: e.target.value }))}
            placeholder="email, phone, ABN, or organisation ID"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Payment instructions</label>
          <textarea
            value={paymentDetails.instructions ?? ''}
            onChange={e => setPaymentDetails(prev => ({ ...prev, instructions: e.target.value }))}
            rows={3}
            placeholder="Example: Please use the invoice number as the payment reference."
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-bold text-gray-900">Round time entries</p>
          <p className="text-xs font-medium text-gray-500">When enabled, clock-outs and manual entries are rounded to the nearest 15 minutes.</p>
        </div>
        <button
          type="button"
          onClick={() => setRoundingEnabled(value => !value)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${roundingEnabled ? 'bg-cyan-500' : 'bg-gray-200'}`}
        >
          <span className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${roundingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="payCadence" className="block text-sm font-bold text-gray-900">Pay cadence</label>
          <select
            id="payCadence" value={payCadence}
            onChange={e => setPayCadence(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label htmlFor="superRate" className="block text-sm font-bold text-gray-900">Super rate %</label>
          <input
            id="superRate" type="number" min="0" max="100" step="0.1"
            value={superRate}
            onChange={e => setSuperRate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="payWeekStartDay" className="block text-sm font-bold text-gray-900">Pay week starts on</label>
        <select
          id="payWeekStartDay" value={payWeekStartDay}
          onChange={e => setPayWeekStartDay(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
          <option value={2}>Tuesday</option>
          <option value={3}>Wednesday</option>
          <option value={4}>Thursday</option>
          <option value={5}>Friday</option>
          <option value={6}>Saturday</option>
        </select>
        <p className="mt-1 text-xs font-medium text-gray-500">Roster weeks and timesheets are anchored to this day.</p>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search employees…" />

      {initialMembers.length > 0 && filteredMembers.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No matches.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-bold uppercase tracking-wide text-gray-500">
              <th className="py-3 pr-4">Employee</th>
              <th className="py-3 pr-4">Role</th>
              <th className="py-3">Hourly rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMembers.map(member => {
              const profile = member.profiles
              const name = profile?.full_name || profile?.email || 'Unknown'
              return (
                <tr key={member.id}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-gray-900">{name}</p>
                    {profile?.full_name && <p className="text-xs font-medium text-gray-500">{profile.email}</p>}
                  </td>
                  <td className="py-3 pr-4 text-xs font-bold capitalize text-gray-500">{member.role}</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rates[member.id] ?? ''}
                      onChange={event => setRates(current => ({ ...current, [member.id]: event.target.value }))}
                      placeholder="$/hr"
                      className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {loading ? 'Saving...' : saved ? 'Saved!' : 'Save organisation settings'}
      </button>
    </form>
  )
}
