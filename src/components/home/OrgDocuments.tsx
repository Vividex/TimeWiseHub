import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { FileText } from 'lucide-react'

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

export default async function OrgDocuments({ orgId }: { orgId: string }) {
  const supabase = await createClient()

  const { data: docs } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, subtotal, currency')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(12)

  if (!docs || docs.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Org documents</h2>
        <div className="flex gap-4">
          <Link href="/dashboard/quotes" className="text-xs font-bold text-cyan-600 hover:underline">Quotes →</Link>
          <Link href="/dashboard/invoices" className="text-xs font-bold text-cyan-600 hover:underline">Invoices →</Link>
        </div>
      </div>
      <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">
        {docs.map(doc => (
          <Link key={doc.id} href={`/dashboard/invoices/${doc.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-800/60">
            <div className="flex min-w-0 items-center gap-3">
              <FileText size={14} className="shrink-0 text-gray-400" />
              <span className="truncate text-sm font-bold text-gray-900">{doc.invoice_number}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {doc.currency} {Number(doc.subtotal).toFixed(2)}
              </span>
              <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[doc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {statusLabel(doc.status)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
