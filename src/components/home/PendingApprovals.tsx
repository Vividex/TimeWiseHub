import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { Clock } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function PendingApprovals({
  orgId,
  userId,
  role,
}: {
  orgId: string
  userId: string
  role: string
}) {
  const supabase = await createClient()

  const { data: allPending } = await supabase
    .from('invoices')
    .select('id, invoice_number, subtotal, currency, created_at, owner_id')
    .eq('org_id', orgId)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  if (!allPending || allPending.length === 0) return null

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

  if (myPending.length === 0) return null

  // Fetch submitter display names
  const ownerIds = [...new Set(myPending.map(p => p.owner_id))]
  const { data: profiles } = await supabase
    .from('profiles').select('id, full_name, email').in('id', ownerIds)
  const nameMap = new Map(
    (profiles ?? []).map(p => [p.id, p.full_name || p.email || 'Unknown'])
  )

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
        Pending your approval
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
          {myPending.length}
        </span>
      </h2>
      <div className="divide-y divide-gray-100 rounded-2xl border border-amber-200 bg-white shadow-sm dark:divide-slate-800 dark:border-amber-500/20 dark:bg-slate-900">
        {myPending.map(doc => (
          <Link key={doc.id} href={`/dashboard/invoices/${doc.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10">
            <div className="flex min-w-0 items-center gap-3">
              <Clock size={14} className="shrink-0 text-amber-500 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{doc.invoice_number}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{nameMap.get(doc.owner_id) ?? 'Unknown'}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                {doc.currency} {Number(doc.subtotal).toFixed(2)}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500">{timeAgo(doc.created_at)}</span>
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">Review →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
