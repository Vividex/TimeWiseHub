'use client'

import { BUILTIN_STICKERS } from '@/lib/worksheets/stickers'

export default function StickerPalette({ onPick }: { onPick: (stickerId: string) => void }) {
  return (
    <div className="flex gap-2 p-2">
      {BUILTIN_STICKERS.map(s => {
        const Icon = s.icon
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            title={s.label}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700"
            style={{ color: s.color }}
          >
            <Icon size={18} />
          </button>
        )
      })}
    </div>
  )
}
