// src/components/video/WorksheetFullScreen.tsx
'use client'

import { X } from 'lucide-react'

export default function WorksheetFullScreen({
  title,
  onClose,
  children,
  theme = 'dark',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  theme?: 'dark' | 'light'
}) {
  const isDark = theme === 'dark'
  return (
    <div className={`fixed inset-0 z-40 flex flex-col ${isDark ? 'bg-slate-950' : 'bg-white'}`}>
      <div className={`flex items-center justify-between gap-4 border-b px-4 py-3 ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
        <div className="min-w-0">
          <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</span>
          <p className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Tip: click Daily&apos;s Picture-in-Picture button first if you want to keep seeing each other while you work here.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`shrink-0 rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
