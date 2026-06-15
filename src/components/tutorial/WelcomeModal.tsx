'use client'
import { useTutorial } from './TutorialProvider'

export default function WelcomeModal() {
  const { phase, advance, skip } = useTutorial()
  if (phase !== 'welcome') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to TimeWiseHub</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
          Let&apos;s show you around — takes about 2 minutes.
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={advance}
            className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
            Show me around
          </button>
          <button onClick={skip}
            className="w-full rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
