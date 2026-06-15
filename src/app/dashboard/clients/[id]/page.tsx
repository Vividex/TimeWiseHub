// src/app/dashboard/clients/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, CalendarClock, NotebookPen } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  quote:     'bg-violet-100 text-violet-700',
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-cyan-100 text-cyan-700',
  paid:      'bg-green-100 text-green-700',
  overdue:   'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function statusLabel(s: string) {
  if (s === 'pending_approval') return 'Pending'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type DocRow = { id: string; invoice_number: string; status: string; issue_date: string; subtotal: number; currency: string }

function DocTable({ rows }: { rows: DocRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 dark:border-slate-800">
          <th className="pb-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Number</th>
          <th className="pb-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Date</th>
          <th className="pb-2 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
          <th className="pb-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
        {rows.map(i => (
          <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
            <td className="py-2.5">
              <Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600 dark:text-slate-100">
                {i.invoice_number}
              </Link>
            </td>
            <td className="py-2.5 text-gray-500">{fmtDate(i.issue_date)}</td>
            <td className="py-2.5 text-right font-bold text-gray-900 dark:text-slate-100">
              {i.currency} {Number(i.subtotal).toFixed(2)}
            </td>
            <td className="py-2.5 text-center">
              <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {statusLabel(i.status)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

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

  const [{ count: projectCount }, { count: sessionCount }, { count: noteCount }] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'active'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('progress_notes').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ])

  let allDocs: DocRow[] = []
  let sales: { id: string; date: string; amount: number; description: string | null; source_type: string }[] = []

  if (canViewFinancials) {
    const [{ data: docs }, { data: inc }] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, status, issue_date, subtotal, currency')
        .eq('client_id', id)
        .order('issue_date', { ascending: false }),
      isAdmin
        ? supabase.from('income_entries').select('id, date, amount, description, source_type').eq('client_id', id).order('date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    allDocs = (docs ?? []) as DocRow[]
    sales = (inc ?? []) as typeof sales
  }

  const invoiceList = allDocs.filter(d => d.status !== 'quote')
  const quoteList   = allDocs.filter(d => d.status === 'quote')

  const outstanding = invoiceList
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + Number(i.subtotal), 0)
  const totalPaid = sales.reduce((s, r) => s + Number(r.amount), 0)

  // Rough single-currency summary for the stat boxes (most common currency or AUD)
  const currencies = [...new Set(invoiceList.filter(i => i.status === 'sent' || i.status === 'overdue').map(i => i.currency))]
  const outstandingCurrency = currencies[0] ?? 'AUD'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        <TileGrid>
          <Tile title="Projects" icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
          <Tile title="Sessions" icon={CalendarClock} accent="#0891b2" stat={sessionCount ?? 0} href={`/dashboard/clients/${id}/sessions`} />
          <Tile title="Progress notes" icon={NotebookPen} accent="#7c3aed" stat={noteCount ?? 0} href={`/dashboard/clients/${id}/notes`} />
        </TileGrid>

        {canViewFinancials && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" open>
            <summary className="cursor-pointer select-none px-6 py-4 text-sm font-bold uppercase tracking-wide text-gray-500">
              Financial details
            </summary>
            <div className="space-y-8 px-6 pb-6">

              {/* Summary stats — only show outstanding if there are sent/overdue invoices */}
              {(outstanding > 0 || totalPaid > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {outstanding > 0 && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                      <p className="mt-1 text-xl font-black text-amber-600">{outstandingCurrency} {outstanding.toFixed(2)}</p>
                    </div>
                  )}
                  {isAdmin && totalPaid > 0 && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recorded payments</p>
                      <p className="mt-1 text-xl font-black text-green-600">AUD {totalPaid.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quotes */}
              <div>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Quotes
                    {quoteList.length > 0 && (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">{quoteList.length}</span>
                    )}
                  </h3>
                  <Link href={`/dashboard/quotes/new?clientId=${id}`}
                    className="inline-flex w-fit rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    + New quote
                  </Link>
                </div>
                {quoteList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 dark:border-slate-700">
                    <p className="text-sm font-semibold text-gray-400">No quotes for this client yet.</p>
                  </div>
                ) : (
                  <DocTable rows={quoteList} />
                )}
              </div>

              {/* Invoices */}
              <div>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Invoices
                    {invoiceList.length > 0 && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{invoiceList.length}</span>
                    )}
                  </h3>
                  <Link href={`/dashboard/invoices/new?clientId=${id}`}
                    className="inline-flex w-fit rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600">
                    + New invoice
                  </Link>
                </div>
                {invoiceList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 dark:border-slate-700">
                    <p className="text-sm font-semibold text-gray-400">No invoices for this client yet.</p>
                  </div>
                ) : (
                  <DocTable rows={invoiceList} />
                )}
              </div>

              {/* Sales & payments — admin only */}
              {isAdmin && (
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Sales &amp; payments</h3>
                  {sales.length === 0 ? (
                    <p className="text-sm font-semibold text-gray-400">No recorded sales.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                        {sales.map(r => (
                          <tr key={r.id}>
                            <td className="py-2 text-gray-500">{r.date}</td>
                            <td className="py-2 text-gray-600 dark:text-slate-300">
                              {r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}
                            </td>
                            <td className="py-2 text-right font-bold text-green-600">AUD {Number(r.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
