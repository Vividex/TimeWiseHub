// src/components/insights/InsightsTabs.tsx
'use client'

import { useState } from 'react'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  { key: 'export', label: 'Export' },
] as const

export default function InsightsTabs({
  defaultTab,
  overview,
  activity,
  exportPanel,
}: {
  defaultTab: 'overview' | 'activity' | 'export'
  overview: React.ReactNode
  activity: React.ReactNode
  exportPanel: React.ReactNode
}) {
  const [tab, setTab] = useState<'overview' | 'activity' | 'export'>(defaultTab)
  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-slate-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'overview'}>{overview}</div>
      <div hidden={tab !== 'activity'}>{activity}</div>
      <div hidden={tab !== 'export'}>{exportPanel}</div>
    </div>
  )
}
