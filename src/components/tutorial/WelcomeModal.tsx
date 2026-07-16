'use client'
import { useTutorial } from './TutorialProvider'

export default function WelcomeModal() {
  const { phase, start, skipTutorial } = useTutorial()
  if (phase !== 'welcome') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to TimeWiseHub</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
          Let&apos;s show you around — takes about 2 minutes.
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={start}
            className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2.5 text-sm font-semibold">
            Show me around
          </button>
          <button onClick={skipTutorial}
            className="w-full rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
