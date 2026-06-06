'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-slate-800" />
  }

  function cycle() {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label} — click to cycle`}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-500 transition-colors hover:bg-gray-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
    >
      <Icon size={16} />
    </button>
  )
}
