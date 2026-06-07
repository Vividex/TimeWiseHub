'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

type NavHistory = { canGoBack: boolean }

const NavHistoryContext = createContext<NavHistory>({ canGoBack: false })

export function useNavHistory(): NavHistory {
  return useContext(NavHistoryContext)
}

/**
 * Tracks whether the user has navigated WITHIN the app this session, so a back
 * control can know if router.back() has somewhere to go (vs a cold landing on a
 * deep page via redirect/deep-link, where it should fall back home).
 */
export default function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [canGoBack, setCanGoBack] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    // Skip the initial mount; only an actual in-app navigation counts.
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setCanGoBack(true)
  }, [pathname])

  return <NavHistoryContext.Provider value={{ canGoBack }}>{children}</NavHistoryContext.Provider>
}
