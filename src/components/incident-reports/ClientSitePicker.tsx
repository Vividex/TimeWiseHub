'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export type ClientOption = { id: string; name: string }
type SiteOption = { id: string; label: string }

export default function ClientSitePicker({
  clients,
  clientId,
  siteId,
  onClientChange,
  onSiteChange,
}: {
  clients: ClientOption[]
  clientId: string
  siteId: string
  onClientChange: (clientId: string) => void
  onSiteChange: (siteId: string) => void
}) {
  const [sites, setSites] = useState<SiteOption[]>([])
  const isFirstRun = useRef(true)

  useEffect(() => {
    // Skip the reset on mount — this component is reused by the incident
    // report *edit* form, which initializes clientId/siteId from an
    // existing report. Resetting siteId here on mount would silently wipe
    // that saved selection before the user touches anything. Only actual
    // client changes (this effect re-firing after mount) should clear it.
    if (isFirstRun.current) {
      isFirstRun.current = false
    } else {
      onSiteChange('')
    }
    if (!clientId) { setSites([]); return }
    const supabase = createClient()
    supabase
      .from('client_sites')
      .select('id, label')
      .eq('client_id', clientId)
      .eq('is_archived', false)
      .order('label')
      .then(({ data }) => setSites(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  return (
    <>
      <label className="space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Client</span>
        <select value={clientId} onChange={e => onClientChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <option value="">No specific client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {sites.length > 0 && (
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Site</span>
          <select value={siteId} onChange={e => onSiteChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <option value="">Client&apos;s main address</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
    </>
  )
}
