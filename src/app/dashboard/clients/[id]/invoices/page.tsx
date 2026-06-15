import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
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

export default async function ClientInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const canView = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  if (!canView) redirect(`/dashboard/clients/${id}`)

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, subtotal, currency')
    .eq('client_id', id)
    .neq('status', 'quote')
    .order('issue_date', { ascending: false })

  const outstanding = (invoices ?? [])
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + Number(i.subtotal), 0)

  const outstandingCurrency = (invoices ?? []).find(i => i.status === 'sent' || i.status === 'overdue')?.currency ?? 'AUD'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/clients/${id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
          <ChevronLeft className="h-4 w-4" />
          {client.name}
        </Link>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Invoices</h1>
          <Link href={`/dashboard/invoices/new?clientId=${id}`}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600">
            + New invoice
          </Link>
        </div>

        {outstanding > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Outstanding balance</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{outstandingCurrency} {outstanding.toFixed(2)}</p>
          </div>
        )}

        {!invoices || invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-slate-700">
            <p className="text-sm font-semibold text-gray-400">No invoices for this client yet.</p>
            <Link href={`/dashboard/invoices/new?clientId=${id}`}
              className="mt-3 inline-block text-sm font-bold text-cyan-600 hover:underline">
              Create the first invoice →
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Number</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Issued</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Due</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/invoices/${inv.id}`}
                        className="font-bold text-slate-900 hover:text-cyan-600 dark:text-slate-100">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(inv.issue_date)}</td>
                    <td className="px-5 py-3 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900 dark:text-slate-100">
                      {inv.currency} {Number(inv.subtotal).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
