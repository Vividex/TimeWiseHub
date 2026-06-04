import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ClientForm from '@/components/clients/ClientForm'
import ClientList from '@/components/clients/ClientList'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const query = orgId
    ? supabase.from('clients').select('*, projects(id)').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`).eq('archived', false).order('name')
    : supabase.from('clients').select('*, projects(id)').eq('owner_id', user.id).eq('archived', false).order('name')

  const { data: raw } = await query

  const clients = (raw ?? []).map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    default_rate: c.default_rate,
    currency: c.currency,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    project_count: (c.projects as any[])?.length ?? 0,
  }))

  const canAdd = !orgId || isAdmin || !membership

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {canAdd && <ClientForm orgId={orgId} />}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">
            Clients ({clients.length})
          </h2>
          <ClientList clients={clients} />
        </div>
      </div>
    </div>
  )
}
