import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, CalendarClock, NotebookPen, ScrollText, FileText, Banknote, Mail, GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import DeleteClientButton from '@/components/clients/DeleteClientButton'
import EditClientButton from '@/components/clients/EditClientButton'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { terminology, key: profileKey } = await getWorkspaceProfileForUser(supabase, user.id)

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const role = membership?.role ?? ''
  const canViewFinancials = ['owner', 'admin', 'manager'].includes(role)
  const isAdmin = ['owner', 'admin'].includes(role)

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address, owner_id, default_rate, currency, messages_last_viewed_at').eq('id', id).maybeSingle()
  if (!client) notFound()

  const canEdit = isAdmin || client.owner_id === user.id

  const [
    { count: projectCount },
    { count: sessionCount },
    { count: noteCount },
  ] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'active'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('progress_notes').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ])

  let studentCount = 0
  if (profileKey === 'tutoring') {
    const { count } = await supabase
      .from('students').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('archived', false)
    studentCount = count ?? 0
  }

  const { data: latestInboundMessage } = await supabase
    .from('client_messages')
    .select('created_at')
    .eq('client_id', id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasUnreadMessages = !!latestInboundMessage && (
    !client.messages_last_viewed_at || new Date(latestInboundMessage.created_at) > new Date(client.messages_last_viewed_at)
  )

  let quoteCount = 0
  let invoiceCount = 0
  let outstandingTotal = 0
  let outstandingCount = 0
  let outstandingCurrency = 'AUD'

  if (canViewFinancials) {
    const [
      { count: qCount },
      { count: iCount },
      { data: outstandingRows },
    ] = await Promise.all([
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'quote'),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('client_id', id).neq('status', 'quote'),
      supabase.from('invoices').select('subtotal, currency').eq('client_id', id).in('status', ['sent', 'overdue']),
    ])
    quoteCount = qCount ?? 0
    invoiceCount = iCount ?? 0
    outstandingCount = (outstandingRows ?? []).length
    outstandingTotal = (outstandingRows ?? []).reduce((s, r) => s + Number(r.subtotal), 0)
    outstandingCurrency = (outstandingRows ?? [])[0]?.currency ?? 'AUD'
  }

  const outstandingMeta = outstandingTotal > 0
    ? `${outstandingCurrency} ${outstandingTotal.toFixed(2)} outstanding`
    : 'All paid'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← {terminology.client.plural}</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
              {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
              {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
              {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit && (
                <EditClientButton client={{
                  id: client.id,
                  name: client.name,
                  email: client.email ?? null,
                  phone: client.phone ?? null,
                  address: client.address ?? null,
                  default_rate: client.default_rate ?? null,
                  currency: client.currency,
                }} clientLabel={terminology.client} />
              )}
              {isAdmin && <DeleteClientButton clientId={id} clientName={client.name} clientLabel={terminology.client} />}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Activity</p>
          <TileGrid>
            <Tile title="Projects" icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
            <Tile title="Sessions" icon={CalendarClock} accent="#0891b2" stat={sessionCount ?? 0} href={`/dashboard/clients/${id}/sessions`} />
            <Tile title="Progress notes" icon={NotebookPen} accent="#7c3aed" stat={noteCount ?? 0} href={`/dashboard/clients/${id}/notes`} />
            {profileKey === 'tutoring' && (
              <Tile title="Students" icon={GraduationCap} accent="#16a34a" stat={studentCount} href={`/dashboard/clients/${id}/students`} />
            )}
            <Tile
              title="Messages"
              icon={Mail}
              accent="#0d9488"
              href={`/dashboard/clients/${id}/messages`}
              badge={hasUnreadMessages ? { label: 'New', tone: 'red' } : undefined}
            />
          </TileGrid>
        </div>

        {canViewFinancials && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Financial</p>
            <TileGrid>
              <Tile
                title="Quotes"
                icon={ScrollText}
                accent="#7c3aed"
                stat={quoteCount}
                href={`/dashboard/clients/${id}/quotes`}
              />
              <Tile
                title="Invoices"
                icon={FileText}
                accent="#0891b2"
                stat={invoiceCount}
                href={`/dashboard/clients/${id}/invoices`}
              />
              {isAdmin && (
                <Tile
                  title="Payments"
                  icon={Banknote}
                  accent={outstandingCount > 0 ? '#d97706' : '#16a34a'}
                  stat={outstandingCount}
                  meta={outstandingMeta}
                  href={`/dashboard/clients/${id}/payments`}
                />
              )}
            </TileGrid>
          </div>
        )}
      </div>
    </div>
  )
}
