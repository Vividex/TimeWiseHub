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

  // Only show once the user has actually navigated away from a hub/main page.
  // The hub needs no back button (everything is a click away), and this also
  // keeps the control off the logo on landing/main pages.
  if (pathname.startsWith('/dashboard') || ROOT_ROUTES.has(pathname) || !canGoBack) return null

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => router.back()}
      className="fixed left-3 top-3 z-40 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 py-1.5 pl-2 pr-3 text-sm font-semibold text-gray-700 shadow-sm backdrop-blur transition-colors hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:text-cyan-400"
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  )
}
