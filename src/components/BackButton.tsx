'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useNavHistory } from './NavHistoryProvider'

// Pages where "back" is meaningless — the control hides on these.
const ROOT_ROUTES = new Set(['/', '/dashboard', '/login', '/onboarding'])

export default function BackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const { canGoBack } = useNavHistory()

  if (ROOT_ROUTES.has(pathname)) return null

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => (canGoBack ? router.back() : router.push('/dashboard'))}
      className="fixed left-3 top-3 z-40 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 py-1.5 pl-2 pr-3 text-sm font-semibold text-gray-700 shadow-sm backdrop-blur transition-colors hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:text-cyan-400"
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  )
}
