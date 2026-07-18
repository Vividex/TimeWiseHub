'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import AddressAutocomplete from '@/components/ui/AddressAutocomplete'

export default function SiteForm({ clientId, defaultOpen = false }: { clientId: string; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('client_sites').insert({
      client_id: clientId,
      address,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      access_notes: accessNotes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setAddress(''); setContactName(''); setContactPhone(''); setAccessNotes('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold">
        {open ? 'Cancel' : '+ Add site'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address *</label>
            <AddressAutocomplete required value={address} onChange={setAddress}
              placeholder="e.g. 42 Industrial Rd, Dandenong VIC"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact name</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
              placeholder="If different from the client"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Site contact phone</label>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Access notes</label>
            <textarea value={accessNotes} onChange={e => setAccessNotes(e.target.value)} rows={3}
              placeholder="Gate code, key location, parking instructions"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? 'Saving…' : 'Save site'}
          </button>
        </form>
      )}
    </div>
  )
}
