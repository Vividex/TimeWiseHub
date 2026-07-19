import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import NewInvoiceForm from '@/components/invoices/NewInvoiceForm'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} clientLabel={terminology.client} projectLabel={terminology.project} />
      </div>
    </div>
  )
}
