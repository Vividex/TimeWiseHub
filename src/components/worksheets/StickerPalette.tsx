// src/components/worksheets/StickerPalette.tsx
'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { BUILTIN_STICKERS } from '@/lib/worksheets/stickers'
import { createClient } from '@/lib/supabase-browser'

export default function StickerPalette({
  bucket,
  buildUploadPath,
  onPick,
  onUploadCustom,
}: {
  bucket: string
  buildUploadPath: (file: File) => string
  onPick: (stickerId: string) => void
  onUploadCustom: (storagePath: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const storagePath = buildUploadPath(file)
    const supabase = createClient()
    const { error } = await supabase.storage.from(bucket).upload(storagePath, file)
    if (!error) onUploadCustom(storagePath)
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-2 p-2">
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
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Upload a custom sticker"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
      >
        <Upload size={16} />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  )
}
