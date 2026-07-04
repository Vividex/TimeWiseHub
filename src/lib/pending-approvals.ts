import { createClient } from '@/lib/supabase-server'

export type PendingApproval = {
  id: string
  invoice_number: string
  subtotal: number
  currency: string
  created_at: string
  submitter_name: string
}

/** Invoices awaiting approval, scoped to what this user is allowed to approve. */
export async function getPendingApprovals(orgId: string, userId: string, role: string): Promise<PendingApproval[]> {
  const supabase = await createClient()

  const { data: allPending } = await supabase
    .from('invoices')
    .select('id, invoice_number, subtotal, currency, created_at, owner_id')
    .eq('org_id', orgId)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  if (!allPending || allPending.length === 0) return []

  let myPending = allPending

  if (role === 'manager') {
    // Determine which pending items are routed to this manager
    const { data: myCrews } = await supabase
      .from('crews').select('id').eq('org_id', orgId).eq('manager_id', userId)

    const myCrewIds = (myCrews ?? []).map(c => c.id)
    const myCrewMemberIds = new Set<string>()

    if (myCrewIds.length > 0) {
      const { data: myMembers } = await supabase
        .from('crew_members').select('user_id').in('crew_id', myCrewIds)
      ;(myMembers ?? []).forEach(m => myCrewMemberIds.add(m.user_id))
    }

    // All crew member IDs in this org (to find no-crew employees)
    const { data: orgCrews } = await supabase.from('crews').select('id').eq('org_id', orgId)
    const orgCrewIds = (orgCrews ?? []).map(c => c.id)
    const allCrewMemberIds = new Set<string>()
    if (orgCrewIds.length > 0) {
      const { data: allMembers } = await supabase
        .from('crew_members').select('user_id').in('crew_id', orgCrewIds)
      ;(allMembers ?? []).forEach(m => allCrewMemberIds.add(m.user_id))
    }

    // Managers see: their crew members + employees with no crew (fallback)
    myPending = allPending.filter(item =>
      myCrewMemberIds.has(item.owner_id) || !allCrewMemberIds.has(item.owner_id)
    )
  }
  // admin/owner sees everything — no filter needed

  if (myPending.length === 0) return []

  const ownerIds = [...new Set(myPending.map(p => p.owner_id))]
  const { data: profiles } = await supabase
    .from('profiles').select('id, full_name, email').in('id', ownerIds)
  const nameMap = new Map(
    (profiles ?? []).map(p => [p.id, p.full_name || p.email || 'Unknown'])
  )

  return myPending.map(p => ({
    id: p.id,
    invoice_number: p.invoice_number,
    subtotal: p.subtotal,
    currency: p.currency,
    created_at: p.created_at,
    submitter_name: nameMap.get(p.owner_id) ?? 'Unknown',
  }))
}
