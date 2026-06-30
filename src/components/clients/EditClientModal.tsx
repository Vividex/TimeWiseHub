'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  default_rate: number | null
  currency: string
}

export default function EditClientModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [email, setEmail] = useState(client.email ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [address, setAddress] = useState(client.address ?? '')
  const [rate, setRate] = useState(client.default_rate?.toString() ?? '')
  const [currency, setCurrency] = useState(client.currency)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        default_rate: rate ? Number(rate) : null,
        currency,
      }),
    })
    if (res.ok) {
      onClose()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to save')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit client</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Client name *</label>
            <input ref={firstRef} required type="text" value={name} onChange={e => setName(e.target.value)}
              className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Default hourly rate</label>
              <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
