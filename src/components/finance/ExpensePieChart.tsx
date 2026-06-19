'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export type CategorySlice = { name: string; value: number }

const COLOURS = ['#22d3ee', '#fb7185', '#a78bfa', '#fbbf24', '#34d399', '#f97316', '#818cf8', '#94a3b8']

type TooltipProps = {
  active?: boolean
  payload?: { name: string; value: number }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-slate-200">{payload[0].name}</p>
      <p className="text-slate-400">{fmt.format(payload[0].value)}</p>
    </div>
  )
}

export default function ExpensePieChart({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) return null
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Expenses by Category</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
