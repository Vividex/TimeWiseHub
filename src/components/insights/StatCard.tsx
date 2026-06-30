const COLOURS = {
  blue:   'text-cyan-600 dark:text-cyan-400',
  green:  'text-emerald-600 dark:text-emerald-400',
  orange: 'text-amber-600 dark:text-amber-400',
  purple: 'text-violet-600 dark:text-violet-400',
}

export default function StatCard({ label, value, sub, colour = 'blue' }: {
  label: string
  value: string
  sub?: string
  colour?: keyof typeof COLOURS
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-xs font-bold uppercase tracking-widest ${COLOURS[colour]}`}>{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}
