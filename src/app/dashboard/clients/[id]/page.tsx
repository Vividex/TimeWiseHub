// src/app/dashboard/clients/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, CalendarClock, NotebookPen } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

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

  const [{ count: projectCount }, { count: sessionCount }, { count: noteCount }] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'active'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('progress_notes').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ])

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

        {isAdmin && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer select-none px-6 py-4 text-sm font-bold uppercase tracking-wide text-gray-500">Financial details</summary>
            <div className="space-y-6 px-6 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                  <p className="mt-1 text-xl font-black text-amber-600">{fmt(outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                  <p className="mt-1 text-xl font-black text-green-600">{fmt(paid)}</p>
                </div>
              </div>
              <div>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Invoices</h3>
                  <Link
                    href={`/dashboard/invoices/new?clientId=${id}`}
                    className="inline-flex w-fit rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600"
                  >
                    Create invoice
                  </Link>
                </div>
                {invoices.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 dark:border-slate-700">
                    <p className="text-sm font-semibold text-gray-400">No invoices.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                      {invoices.map(i => (
                        <tr key={i.id}>
                          <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600 dark:text-slate-100">{i.invoice_number}</Link></td>
                          <td className="py-2 text-gray-500">{i.issue_date}</td>
                          <td className="py-2 text-right font-bold">{fmt(Number(i.subtotal))}</td>
                          <td className="py-2 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Sales &amp; payments</h3>
                {sales.length === 0 ? <p className="text-sm font-semibold text-gray-400">No recorded sales.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                      {sales.map(r => (
                        <tr key={r.id}>
                          <td className="py-2 text-gray-500">{r.date}</td>
                          <td className="py-2 text-gray-600 dark:text-slate-300">{r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}</td>
                          <td className="py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
