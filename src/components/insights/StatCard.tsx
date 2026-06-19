const COLOURS = {
  blue:   'text-cyan-400',
  green:  'text-emerald-400',
  orange: 'text-amber-400',
  purple: 'text-violet-400',
}

export default function StatCard({ label, value, sub, colour = 'blue' }: {
  label: string
  value: string
  sub?: string
  colour?: keyof typeof COLOURS
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <p className={`text-xs font-bold uppercase tracking-widest ${COLOURS[colour]}`}>{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-sm font-semibold text-slate-400">{sub}</p>}
    </div>
  )
}

