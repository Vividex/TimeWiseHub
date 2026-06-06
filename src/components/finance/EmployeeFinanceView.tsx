import { createClient } from '@/lib/supabase-server'

type OwnTimesheet = {
  id: string
  week_start: string
  status: string
  total_seconds: number
}

function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

export default async function EmployeeFinanceView({ userId }: { userId: string }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('timesheets')
    .select('id, week_start, status, total_seconds')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(12)

  const timesheets = (data ?? []) as OwnTimesheet[]

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statements</h2>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Coming with the payroll module. Your gross pay, tax estimate, and net pay will appear here — visible only to you and your employer.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your recent timesheets</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {timesheets.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">
                No timesheets yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Week of</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hours</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map(ts => (
                    <tr key={ts.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{ts.week_start}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatHours(ts.total_seconds)}</td>
                      <td className="px-4 py-3 text-right font-semibold capitalize text-gray-600 dark:text-slate-300">{ts.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
