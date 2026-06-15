import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, CalendarClock, NotebookPen, ScrollText, FileText, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const role = membership?.role ?? ''
  const canViewFinancials = ['owner', 'admin', 'manager'].includes(role)
  const isAdmin = ['owner', 'admin'].includes(role)

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [
    { count: projectCount },
    { count: sessionCount },
    { count: noteCount },
  ] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'active'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('progress_notes').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ])

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
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Activity</p>
          <TileGrid>
            <Tile title="Projects" icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
            <Tile title="Sessions" icon={CalendarClock} accent="#0891b2" stat={sessionCount ?? 0} href={`/dashboard/clients/${id}/sessions`} />
            <Tile title="Progress notes" icon={NotebookPen} accent="#7c3aed" stat={noteCount ?? 0} href={`/dashboard/clients/${id}/notes`} />
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
