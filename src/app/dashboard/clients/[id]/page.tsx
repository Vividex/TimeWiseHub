import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import NewSessionModal from '@/components/clients/NewSessionModal'
import AddProgressNote from '@/components/clients/AddProgressNote'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}
const SESSION_STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}
const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
}
const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [{ data: sessions }, { data: notes }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, status, session_todos(id, completed)')
      .eq('client_id', id)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('progress_notes')
      .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])

  const allSessions = sessions ?? []
  const upcoming = allSessions.filter(s => s.status !== 'completed')
  const past = allSessions.filter(s => s.status === 'completed')
  const lastCompleted = past[0]
  const notesData = notes ?? []

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

        {/* Header */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Upcoming</p>
            <p className="mt-1 text-2xl font-black text-cyan-600">{upcoming.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Total sessions</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{allSessions.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Last session</p>
            <p className="mt-1 text-sm font-black text-gray-900">
              {lastCompleted ? fmtDate(lastCompleted.scheduled_at) : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Progress notes</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{notesData.length}</p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Sessions — wider */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Sessions</h2>
              <NewSessionModal clientId={client.id} orgId={orgId} />
            </div>

            {upcoming.length === 0 && past.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-8 text-center text-sm font-semibold text-gray-400">
                No sessions yet. Create the first one.
              </p>
            )}

            {upcoming.map(s => {
              const total = (s.session_todos as { completed: boolean }[]).length
              const done = (s.session_todos as { completed: boolean }[]).filter(t => t.completed).length
              return (
                <Link key={s.id} href={`/dashboard/clients/${id}/sessions/${s.id}`}
                  className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900">{s.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{fmtDateTime(s.scheduled_at)} · {s.duration_minutes} min</p>
                      {total > 0 && <p className="mt-1 text-xs font-semibold text-gray-400">{done}/{total} done</p>}
                    </div>
                    <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${SESSION_STATUS_STYLE[s.status]}`}>
                      {SESSION_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                </Link>
              )
            })}

            {past.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 pt-2">Past sessions</p>
                {past.map(s => {
                  const total = (s.session_todos as { completed: boolean }[]).length
                  const done = (s.session_todos as { completed: boolean }[]).filter(t => t.completed).length
                  return (
                    <Link key={s.id} href={`/dashboard/clients/${id}/sessions/${s.id}`}
                      className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-700">{s.title}</p>
                          <p className="mt-0.5 text-sm text-gray-400">{fmtDateTime(s.scheduled_at)} · {s.duration_minutes} min</p>
                          {total > 0 && <p className="mt-1 text-xs font-semibold text-gray-400">{done}/{total} done</p>}
                        </div>
                        <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${SESSION_STATUS_STYLE[s.status]}`}>
                          {SESSION_STATUS_LABEL[s.status]}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </>
            )}
          </div>

          {/* Progress notes — narrower */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Progress notes</h2>
            <AddProgressNote clientId={client.id} orgId={orgId} />

            <div className="space-y-3">
              {notesData.map(n => {
                const author = (n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown'
                return (
                  <div key={n.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-500">{author}</span>
                      <span className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                  </div>
                )
              })}

              {notesData.length === 0 && (
                <p className="text-sm font-semibold text-gray-400">No notes yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Financials — collapsible, admin only */}
        {isAdmin && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-wide text-gray-500 select-none">
              Financial details
            </summary>
            <div className="px-6 pb-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                  <p className="mt-1 text-xl font-black text-amber-600">{fmt(outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                  <p className="mt-1 text-xl font-black text-green-600">{fmt(paid)}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Invoices</h3>
                {invoices.length === 0 ? <p className="text-sm font-semibold text-gray-400">No invoices.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {invoices.map(i => (
                        <tr key={i.id}>
                          <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{i.invoice_number}</Link></td>
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
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
