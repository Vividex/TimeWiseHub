'use client'
import { useTutorial } from './TutorialProvider'

const TIPS = [
  { heading: 'Quiet hours', body: "Set your working hours in Settings. Chat notifications won't interrupt you outside them." },
  { heading: 'Expense export', body: 'Log expenses as you go, then export a CSV for your accountant at tax time.' },
  { heading: 'Insights', body: 'See billable vs non-billable time, project health, and team activity at a glance.' },
  { heading: 'Leave balances', body: 'Request leave and track your balance under People → Leave.' },
  { heading: 'Quotes', body: 'Draft a quote for a client and convert it into an invoice when the work is confirmed.' },
]

export default function TipsScreen() {
  const { phase, advance } = useTutorial()
  if (phase !== 'tips') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">A few things worth knowing</h2>
        <div className="space-y-4 mb-8">
          {TIPS.map((t, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">{t.heading}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t.body}</p>
            </div>
          ))}
        </div>
        <button onClick={advance}
          className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}
