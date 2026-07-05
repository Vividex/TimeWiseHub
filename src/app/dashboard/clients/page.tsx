import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ClientForm from '@/components/clients/ClientForm'
import QuickSaleForm from '@/components/clients/QuickSaleForm'
import { Tile, TileGrid } from '@/components/ui/Tile'
import RestoreClientButton from '@/components/clients/RestoreClientButton'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

const fmtCurrency = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const baseFilter = orgId
    ? supabase.from('clients').select('*, projects(id)').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
    : supabase.from('clients').select('*, projects(id)').eq('owner_id', user.id)

  const [{ data: raw }, { data: rawArchived }] = await Promise.all([
    baseFilter.eq('archived', false).order('name'),
    isAdmin
      ? (orgId
          ? supabase.from('clients').select('id, name, email').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`).eq('archived', true).order('name')
          : supabase.from('clients').select('id, name, email').eq('owner_id', user.id).eq('archived', true).order('name'))
      : Promise.resolve({ data: [] }),
  ])

  // Per-client revenue (owner/admin only).
  const outstandingByClient = new Map<string, number>()
  const paidByClient = new Map<string, number>()
  if (isAdmin) {
    const scope = orgId
      ? { col: 'org_id', val: orgId }
      : { col: 'owner_id', val: user.id }

    const [{ data: openInvoices }, { data: clientIncome }] = await Promise.all([
      supabase.from('invoices').select('client_id, subtotal, status').eq(scope.col, scope.val).in('status', ['sent', 'overdue']),
      supabase.from('income_entries').select('client_id, amount').eq(scope.col, scope.val).not('client_id', 'is', null),
    ])

    for (const inv of openInvoices ?? []) {
      if (inv.client_id) outstandingByClient.set(inv.client_id, (outstandingByClient.get(inv.client_id) ?? 0) + Number(inv.subtotal))
    }
    for (const row of clientIncome ?? []) {
      if (row.client_id) paidByClient.set(row.client_id, (paidByClient.get(row.client_id) ?? 0) + Number(row.amount))
    }
  }

  const archivedClients = (rawArchived ?? []) as { id: string; name: string; email: string | null }[]

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
    ...(isAdmin ? { outstanding: outstandingByClient.get(c.id) ?? 0, paid: paidByClient.get(c.id) ?? 0 } : {}),
  }))

  const canAdd = !orgId || isAdmin || !membership

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {canAdd && <ClientForm orgId={orgId} clientLabel={terminology.client} />}
        {isAdmin && <QuickSaleForm orgId={orgId} />}
        <div>
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{terminology.client.plural} ({clients.length})</h2>
          <TileGrid empty={`No ${terminology.client.plural.toLowerCase()} yet. Add your first.`}>
            {clients.map(c => (
              <Tile
                key={c.id}
                title={c.name}
                meta={c.email ?? c.phone ?? undefined}
                badge={isAdmin && (c as { outstanding?: number }).outstanding ? { label: fmtCurrency((c as { outstanding: number }).outstanding), tone: 'amber' } : undefined}
                href={`/dashboard/clients/${c.id}`}
              />
            ))}
          </TileGrid>
        </div>

        {isAdmin && archivedClients.length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-400">Archived ({archivedClients.length})</h2>
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                {archivedClients.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/clients/${c.id}`} className="text-sm font-semibold text-gray-500 hover:text-cyan-600 dark:text-slate-400">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                    </div>
                    <RestoreClientButton clientId={c.id} />
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
