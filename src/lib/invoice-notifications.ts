import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'

export async function notifyApprovalRequired({
  invoiceId,
  orgId,
  submitterId,
  invoiceNumber,
  subtotal,
  currency,
}: {
  invoiceId: string
  orgId: string
  submitterId: string
  invoiceNumber: string
  subtotal: number
  currency: string
}) {
  const service = createServiceClient()

  // Submitter display name
  const { data: submitter } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', submitterId)
    .maybeSingle()
  const sp = submitter as { full_name?: string | null; email?: string } | null
  const submitterName = sp?.full_name?.trim() || sp?.email || 'Someone'

  // Resolve recipient list via crew routing
  const { data: memberCrews } = await service
    .from('crew_members')
    .select('crew_id')
    .eq('user_id', submitterId)

  const crewIds = (memberCrews ?? []).map(c => c.crew_id)
  let recipientIds: string[] = []

  if (crewIds.length > 0) {
    // Notify the manager of each crew this employee belongs to (within this org)
    const { data: crews } = await service
      .from('crews')
      .select('manager_id')
      .eq('org_id', orgId)
      .in('id', crewIds)
    recipientIds = [...new Set((crews ?? []).map(c => c.manager_id))]
  }

  if (recipientIds.length === 0) {
    // Fallback: employee has no crew — notify all managers/admins/owners in the org
    const { data: managers } = await service
      .from('organisation_members')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role', ['manager', 'admin', 'owner'])
      .neq('user_id', submitterId)
    recipientIds = (managers ?? []).map(m => m.user_id)
  }

  if (recipientIds.length === 0) return

  const docType = invoiceNumber.startsWith('Q-') ? 'quote' : 'invoice'
  const amountStr = `${currency} ${Number(subtotal).toFixed(2)}`

  await Promise.allSettled(
    recipientIds.map(uid =>
      sendPushToUser(uid, {
        title: `${submitterName} submitted a ${docType} for approval`,
        body: `${invoiceNumber} · ${amountStr}`,
        url: `/dashboard/invoices/${invoiceId}`,
        tag: `approval-required:${invoiceId}`,
      })
    )
  )
}
