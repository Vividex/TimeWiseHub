'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AddressAutocomplete from '@/components/ui/AddressAutocomplete'

type Site = {
  id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
}

export default function EditSiteModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const router = useRouter()
  const [label, setLabel] = useState(site.label)
  const [address, setAddress] = useState(site.address)
  const [contactName, setContactName] = useState(site.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(site.contact_phone ?? '')
  const [accessNotes, setAccessNotes] = useState(site.access_notes ?? '')
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
    const res = await fetch(`/api/client-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        address,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        access_notes: accessNotes || null,
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
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit site</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Label *</label>
            <input ref={firstRef} required type="text" value={label} onChange={e => setLabel(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address *</label>
            <AddressAutocomplete required value={address} onChange={setAddress}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact name</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact phone</label>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Access notes</label>
            <textarea value={accessNotes} onChange={e => setAccessNotes(e.target.value)} rows={3}
              className={`resize-none ${inputCls}`} />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
