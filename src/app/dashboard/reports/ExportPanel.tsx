import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ReportsClient from '@/components/reports/ReportsClient'
import { canExportReports, getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export async function ExportPanel() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const subscription = await getSubscription(user.id)
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  if (!canExportReports(subscription)) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">Paid feature</p>
        <h2 className="mt-2 text-2xl font-black text-gray-900 dark:text-slate-100">Reports export requires Pro or Team</h2>
        <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
          Upgrade to export time logs, expenses, leave summaries, and payroll reports.
        </p>
        <Link href="/dashboard/billing" className="mt-5 inline-flex rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-bold">
          View plans
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ReportsClient
        userId={user.id}
        orgId={membership?.org_id ?? null}
        isManager={isManager && isTeamPlan(subscription)}
        projectLabel={terminology.project}
      />
    </div>
  )
}
