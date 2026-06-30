'use client'

import { useState } from 'react'

type Tab = { key: string; label: string; content: React.ReactNode }

export default function SettingsTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? '')
  const current = tabs.find(t => t.key === active) ?? tabs[0]

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                active === tab.key
                  ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-6">
        {current?.content}
      </div>
    </>
  )
}
