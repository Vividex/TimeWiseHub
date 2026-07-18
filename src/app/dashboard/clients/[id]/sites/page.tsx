import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import SiteForm from '@/components/client-sites/SiteForm'
import EditSiteButton from '@/components/client-sites/EditSiteButton'
import DeleteSiteButton from '@/components/client-sites/DeleteSiteButton'
import RestoreSiteButton from '@/components/client-sites/RestoreSiteButton'

export default async function ClientSitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = await params
  const { new: openNew } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name, owner_id').eq('id', id).maybeSingle()
  if (!client) notFound()
  const canEdit = isAdmin || client.owner_id === user.id

  const [{ data: sites }, { data: archivedSites }] = await Promise.all([
    supabase
      .from('client_sites')
      .select('id, address, contact_name, contact_phone, access_notes')
      .eq('client_id', id)
      .eq('is_archived', false)
      .order('address'),
    canEdit
      ? supabase.from('client_sites').select('id, address').eq('client_id', id).eq('is_archived', true).order('address')
      : Promise.resolve({ data: [] }),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sites</h1>

        {canEdit && <SiteForm clientId={id} defaultOpen={openNew === '1'} />}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {(sites ?? []).length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-slate-500">No sites yet. Add the first one.</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-slate-800">
              {(sites ?? []).map(s => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.address}</p>
                    {(s.contact_name || s.contact_phone) && (
                      <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-slate-500">
                        {[s.contact_name, s.contact_phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <EditSiteButton site={s} />
                      <DeleteSiteButton siteId={s.id} siteAddress={s.address} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit && (archivedSites ?? []).length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-400">Archived ({(archivedSites ?? []).length})</h2>
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                {(archivedSites ?? []).map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">{s.address}</p>
                    <RestoreSiteButton siteId={s.id} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
