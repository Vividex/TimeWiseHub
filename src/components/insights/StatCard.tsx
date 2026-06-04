const COLOURS = {
  blue:   'text-blue-600',
  green:  'text-green-600',
  orange: 'text-orange-600',
  purple: 'text-purple-600',
}

export default function StatCard({ label, value, sub, colour = 'blue' }: {
  label: string
  value: string
  sub?: string
  colour?: keyof typeof COLOURS
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className={`text-xs font-bold uppercase tracking-wide ${COLOURS[colour]}`}>{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-sm font-semibold text-gray-500">{sub}</p>}
    </div>
  )
}
