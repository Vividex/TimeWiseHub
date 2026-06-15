import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function ClientPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  if (!isAdmin) redirect(`/dashboard/clients/${id}`)

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [{ data: outstanding }, { data: sales }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, subtotal, currency, due_date, status')
      .eq('client_id', id)
      .in('status', ['sent', 'overdue'])
      .order('due_date', { ascending: true }),
    supabase
      .from('income_entries')
      .select('id, date, amount, description, source_type')
      .eq('client_id', id)
      .order('date', { ascending: false }),
  ])

  const totalOutstanding = (outstanding ?? []).reduce((s, i) => s + Number(i.subtotal), 0)
  const totalReceived    = (sales ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const outstandingCurrency = (outstanding ?? [])[0]?.currency ?? 'AUD'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">
          ← {client.name}
        </Link>

        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Payments</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
            <p className={`mt-1 text-2xl font-black ${totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {totalOutstanding > 0 ? `${outstandingCurrency} ${totalOutstanding.toFixed(2)}` : 'All clear'}
            </p>
            {totalOutstanding === 0 && <p className="mt-0.5 text-xs text-gray-400">No outstanding invoices</p>}
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recorded payments</p>
            <p className="mt-1 text-2xl font-black text-green-600">AUD {totalReceived.toFixed(2)}</p>
            <p className="mt-0.5 text-xs text-gray-400">{(sales ?? []).length} {(sales ?? []).length === 1 ? 'entry' : 'entries'}</p>
          </div>
        </div>

        {/* Outstanding invoices */}
        {(outstanding ?? []).length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Outstanding invoices</h2>
            <div className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-900/30 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Invoice</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Due</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
                    <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {(outstanding ?? []).map(inv => (
                    <tr key={inv.id} className="hover:bg-amber-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/invoices/${inv.id}`}
                          className="font-bold text-slate-900 hover:text-cyan-600 dark:text-slate-100">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900 dark:text-slate-100">
                        {inv.currency} {Number(inv.subtotal).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-cyan-100 text-cyan-700'}`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recorded payments / sales */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Recorded payments</h2>
          {(sales ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center dark:border-slate-700">
              <p className="text-sm font-semibold text-gray-400">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Description</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {(sales ?? []).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.date)}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-slate-300">
                        {r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-green-600">
                        AUD {Number(r.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
