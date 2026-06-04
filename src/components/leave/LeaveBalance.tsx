type Balance = {
  leave_type: string
  entitled_days: number
  taken_days: number
}

const TYPE_LABELS: Record<string, string> = {
  annual:         'Annual',
  sick:           'Sick',
  personal:       'Personal',
  public_holiday: 'Public Holiday',
  unpaid:         'Unpaid',
  other:          'Other',
}

const TYPE_COLOURS: Record<string, string> = {
  annual:         'text-cyan-600 bg-cyan-50 border-cyan-100',
  sick:           'text-red-600 bg-red-50 border-red-100',
  personal:       'text-purple-600 bg-purple-50 border-purple-100',
  public_holiday: 'text-green-600 bg-green-50 border-green-100',
  unpaid:         'text-gray-600 bg-gray-50 border-gray-100',
  other:          'text-amber-600 bg-amber-50 border-amber-100',
}

export default function LeaveBalance({ balances }: { balances: Balance[] }) {
  if (balances.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {balances.map(b => {
        const remaining = b.entitled_days - b.taken_days
        const pct = b.entitled_days > 0 ? Math.min((b.taken_days / b.entitled_days) * 100, 100) : 0
        const colour = TYPE_COLOURS[b.leave_type] ?? TYPE_COLOURS.other

        return (
          <div key={b.leave_type} className={`rounded-2xl border p-4 ${colour}`}>
            <p className="text-xs font-bold uppercase tracking-wide">{TYPE_LABELS[b.leave_type] ?? b.leave_type}</p>
            <p className="mt-2 text-3xl font-black">{remaining % 1 === 0 ? remaining : remaining.toFixed(1)}</p>
            <p className="text-xs font-semibold opacity-70">days remaining</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
              <div className="h-1.5 rounded-full bg-current opacity-50" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs opacity-60">{b.taken_days} of {b.entitled_days} taken</p>
          </div>
        )
      })}
    </div>
  )
}
