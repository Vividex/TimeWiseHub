import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import NewInvoiceForm from '@/components/invoices/NewInvoiceForm'

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New quote</h1>
          <p className="mt-1 text-sm text-gray-500">Client is optional — you can create a free-standing quote and assign it later.</p>
        </div>
        <NewInvoiceForm
          orgId={membership?.org_id ?? null}
          userId={user.id}
          initialClientId={clientId}
          isQuote={true}
        />
      </div>
    </div>
  )
}
