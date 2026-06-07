'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function QuickSaleForm({ orgId }: { orgId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setError('Enter an amount greater than 0.'); return }
    setLoading(true); setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Find or create the Walk-in client (by flag, scoped to org or owner).
    const finder = supabase.from('clients').select('id').eq('is_walkin', true)
    const { data: existing } = await (orgId
      ? finder.eq('org_id', orgId)
      : finder.eq('owner_id', user.id)
    ).limit(1).maybeSingle()

    let walkinId = existing?.id
    if (!walkinId) {
      const { data: created, error: cErr } = await supabase
        .from('clients')
        .insert({ owner_id: user.id, org_id: orgId, name: 'Walk-in / Cash', is_walkin: true })
        .select('id')
        .single()
      if (cErr || !created) { setError(cErr?.message ?? 'Could not create walk-in client.'); setLoading(false); return }
      walkinId = created.id
    }

    const { error: iErr } = await supabase.from('income_entries').insert({
      user_id: user.id,
      org_id: orgId,
      client_id: walkinId,
      amount: Number(amount),
      currency: 'AUD',
      category: 'Sales',
      date,
      description: note.trim() || null,
      source_type: 'sale',
    })

    if (iErr) { setError(iErr.message); setLoading(false); return }

    setAmount(''); setNote(''); setOpen(false)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600">
        {open ? 'Cancel' : '+ Record a sale'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount (AUD) *</label>
              <input required type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. counter sale"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
            {loading ? 'Saving…' : 'Record sale'}
          </button>
        </form>
      )}
    </div>
  )
}
