import { createClient } from '@/lib/supabase-server'
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'
import PayslipList, { type PayslipRow } from '@/components/finance/PayslipList'

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

  const [{ data: statementsData }, { data: profile }, { data: tsData }, { data: payslipsData }] = await Promise.all([
    supabase
      .from('pay_statements')
      .select('id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(12),
    supabase.from('profiles').select('tax_estimate_pct').eq('id', userId).single(),
    supabase
      .from('timesheets')
      .select('id, week_start, status, total_seconds')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(12),
    supabase
      .from('payslips')
      .select('id, label, pay_date, file_path, uploaded_at')
      .eq('user_id', userId)
      .order('pay_date', { ascending: false }),
  ])

  const statements = (statementsData ?? []) as PayStatement[]
  const taxPct = (profile?.tax_estimate_pct ?? null) as number | null
  const timesheets = (tsData ?? []) as OwnTimesheet[]
  const payslips = (payslipsData ?? []) as PayslipRow[]

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Payslips</h2>
          <PayslipList payslips={payslips} />
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statements</h2>
          {statements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                No pay statements yet. They appear here after your employer runs pay — visible only to you and your employer.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {statements.map(s => (
                <PayStatementCard key={s.id} statement={s} showNet userId={userId} initialTaxPct={taxPct} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your recent timesheets</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {timesheets.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">No timesheets yet.</p>
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
