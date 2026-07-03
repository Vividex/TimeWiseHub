'use client'

import { X } from 'lucide-react'

export type CallPanelTabId = 'transcript' | 'program' | 'chat'

const TAB_LABEL: Record<CallPanelTabId, string> = {
  transcript: 'Transcript',
  program: 'Program',
  chat: 'Chat',
}

export default function CallPanel({
  open,
  activeTab,
  availableTabs,
  onSelectTab,
  onClose,
  children,
}: {
  open: boolean
  activeTab: CallPanelTabId
  availableTabs: CallPanelTabId[]
  onSelectTab: (tab: CallPanelTabId) => void
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2 shrink-0">
        <div className="flex gap-1">
          {availableTabs.map(tab => (
            <button
              key={tab}
              onClick={() => onSelectTab(tab)}
              className={`rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
