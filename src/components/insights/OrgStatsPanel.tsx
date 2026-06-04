export type MemberStat = {
  user_id: string
  name: string
  email: string
  hours: number
  expenses: number
  tasks_completed: number
}

export default function OrgStatsPanel({ members }: { members: MemberStat[] }) {
  if (members.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Team — this month</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Member</th>
              <th className="pb-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Hours</th>
              <th className="pb-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Expenses</th>
              <th className="pb-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Tasks done</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(m => (
              <tr key={m.user_id}>
                <td className="py-3 pr-4">
                  <p className="font-semibold text-gray-900">{m.name || m.email}</p>
                  {m.name && <p className="text-xs text-gray-400">{m.email}</p>}
                </td>
                <td className="py-3 text-center font-semibold text-gray-500">{m.hours.toFixed(1)}h</td>
                <td className="py-3 text-center font-semibold text-gray-500">${m.expenses.toFixed(2)}</td>
                <td className="py-3 text-right font-bold text-gray-900">{m.tasks_completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
