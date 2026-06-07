import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
}
const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  let invoices: { id: string; invoice_number: string; status: string; issue_date: string; subtotal: number }[] = []
  let sales: { id: string; date: string; amount: number; description: string | null; source_type: string }[] = []
  let outstanding = 0
  let paid = 0
  if (isAdmin) {
    const [{ data: inv }, { data: inc }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, status, issue_date, subtotal').eq('client_id', id).order('issue_date', { ascending: false }),
      supabase.from('income_entries').select('id, date, amount, description, source_type').eq('client_id', id).order('date', { ascending: false }),
    ])
    invoices = (inv ?? []) as typeof invoices
    sales = (inc ?? []) as typeof sales
    outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.subtotal), 0)
    paid = sales.reduce((s, r) => s + Number(r.amount), 0)
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        {!isAdmin ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-500">
            Revenue details are visible to owners and admins only.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                <p className="mt-1 text-2xl font-black text-amber-600">{fmt(outstanding)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                <p className="mt-1 text-2xl font-black text-green-600">{fmt(paid)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Invoices</h2>
              {invoices.length === 0 ? <p className="text-sm font-semibold text-gray-400">No invoices.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map(i => (
                      <tr key={i.id}>
                        <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{i.invoice_number}</Link></td>
                        <td className="py-2 text-gray-500">{i.issue_date}</td>
                        <td className="py-2 text-right font-bold text-gray-900">{fmt(Number(i.subtotal))}</td>
                        <td className="py-2 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Sales &amp; payments</h2>
              {sales.length === 0 ? <p className="text-sm font-semibold text-gray-400">No recorded sales.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {sales.map(r => (
                      <tr key={r.id}>
                        <td className="py-2 text-gray-500">{r.date}</td>
                        <td className="py-2 text-gray-600">{r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}</td>
                        <td className="py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
