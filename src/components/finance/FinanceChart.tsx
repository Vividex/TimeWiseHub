'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

export type MonthBar = {
  label: string
  income: number
  totalExpenses: number
  profit: number
}

function niceMax(val: number): number {
  if (val <= 0) return 1000
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)))
  const factor = val / magnitude
  const nice = factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10
  return nice * magnitude
}

function fmtAxis(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
  return `$${v}`
}

type TooltipProps = {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs shadow-xl">
      <p className="mb-2 font-bold text-slate-200">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt.format(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function FinanceChart({ months }: { months: MonthBar[] }) {
  const allVals = months.flatMap(m => [m.income, m.totalExpenses, Math.abs(m.profit)])
  const maxVal = Math.max(...allVals, 0)
  const yMax = niceMax(maxVal)
  const tickCount = 5

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Monthly P&amp;L</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            domain={[0, yMax]}
            tickCount={tickCount}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
          />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="#22d3ee"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#22d3ee' }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="totalExpenses"
            name="Expenses"
            stroke="#fb7185"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#fb7185' }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="profit"
            name="Profit"
            stroke="#34d399"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#34d399' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
