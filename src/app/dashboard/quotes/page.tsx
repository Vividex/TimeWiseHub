import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import InvoiceTable from '@/components/invoices/InvoiceTable'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const quoteQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, subtotal, currency, clients(name)')
    .eq('status', 'quote')
    .order('created_at', { ascending: false })

  const { data: quotes } = orgId
    ? await quoteQuery.or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
    : await quoteQuery.eq('owner_id', user.id)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Quotes</h1>
            <p className="mt-1 text-sm text-gray-500">Draft proposals to send to clients. Convert to an invoice when approved.</p>
          </div>
          <Link href="/dashboard/quotes/new"
            className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600">
            + New quote
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <InvoiceTable
            invoices={(quotes ?? []) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]}
            emptyMessage="No quotes yet."
            emptyLink={{ href: '/dashboard/quotes/new', label: 'Create your first quote →' }}
          />
        </div>

      </div>
    </div>
  )
}
