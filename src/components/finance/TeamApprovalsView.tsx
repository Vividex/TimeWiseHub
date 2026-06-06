import { createClient } from '@/lib/supabase-server'

type TeamTimesheet = {
  id: string
  user_id: string
  week_start: string
  status: string
  total_seconds: number
  profiles: { full_name: string | null; email: string } | null
}

function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

export default async function TeamApprovalsView({ orgId, userId }: { orgId: string; userId: string }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('timesheets')
    .select('id, user_id, week_start, status, total_seconds, profiles!timesheets_user_id_fkey(full_name, email)')
    .eq('org_id', orgId)
    .in('status', ['submitted', 'approved', 'rejected'])
    .order('week_start', { ascending: false })
    .limit(50)

  const timesheets = (data ?? []) as unknown as TeamTimesheet[]
  const pending = timesheets.filter(t => t.status === 'submitted')

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Team timesheets</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            {pending.length} awaiting your review. Hours only — pay amounts are not shown to managers.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {timesheets.length === 0 ? (
            <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">
              No submitted timesheets.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Week of</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map(ts => (
                  <tr key={ts.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {ts.profiles?.full_name ?? ts.profiles?.email ?? 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ts.week_start}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatHours(ts.total_seconds)}</td>
                    <td className="px-4 py-3 text-right font-semibold capitalize text-gray-600 dark:text-slate-300">{ts.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statement</h2>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Coming with the payroll module — visible only to you and your employer.
          </p>
        </div>
      </div>
    </div>
  )
}
