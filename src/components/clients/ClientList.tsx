'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  default_rate: number | null
  currency: string
  project_count: number
  outstanding?: number
  paid?: number
}

export default function ClientList({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const [archiving, setArchiving] = useState<string | null>(null)
  const { query, setQuery, filtered } = useTextFilter(
    clients,
    c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`,
  )

  async function handleArchive(id: string) {
    setArchiving(id)
    const supabase = createClient()
    await supabase.from('clients').update({ archived: true }).eq('id', id)
    setArchiving(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search clients…" />
      {clients.length === 0 ? (
        <p className="text-sm font-semibold text-gray-400">No clients yet. Add your first client above.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm font-semibold text-gray-400">No matches.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map(c => (
            <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/clients/${c.id}`} className="text-base font-bold text-gray-900 truncate hover:text-cyan-600">{c.name}</Link>
                  {c.email && <p className="mt-0.5 text-sm text-gray-500 truncate">{c.email}</p>}
                  {c.phone && <p className="text-sm text-gray-500">{c.phone}</p>}
                  {c.address && <p className="mt-1 text-xs text-gray-400 truncate">{c.address}</p>}
                </div>
                <button onClick={() => handleArchive(c.id)} disabled={archiving === c.id}
                  className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50">
                  Archive
                </button>
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-3">
                {c.default_rate ? (
                  <span className="text-sm font-bold text-cyan-600">{c.currency} {Number(c.default_rate).toFixed(2)}/hr</span>
                ) : (
                  <span className="text-xs text-gray-400">No default rate</span>
                )}
                <span className="text-xs text-gray-400">{c.project_count} project{c.project_count !== 1 ? 's' : ''}</span>
                {c.outstanding !== undefined && (
                  <span className="text-xs font-bold text-amber-600">Outstanding ${c.outstanding.toFixed(2)}</span>
                )}
                {c.paid !== undefined && (
                  <span className="text-xs font-bold text-green-600">Paid ${c.paid.toFixed(2)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
