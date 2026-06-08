'use client'

import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { ChatAttachment } from '@/lib/chat/types'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = attachment.mime_type.startsWith('image/')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(attachment.storage_path, 3600)
      if (!cancelled) setUrl(data?.signedUrl ?? null)
    })()
    return () => { cancelled = true }
  }, [attachment.storage_path])

  if (isImage && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={attachment.file_name}
          className="mt-2 max-h-64 max-w-xs rounded-xl border border-gray-200 object-cover dark:border-slate-700"
        />
      </a>
    )
  }

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <FileText size={16} className="shrink-0 text-cyan-600" />
      <span className="max-w-[180px] truncate">{attachment.file_name}</span>
      <span className="text-xs text-gray-400">{fmtSize(attachment.size_bytes)}</span>
      <Download size={14} className="shrink-0 text-gray-400" />
    </a>
  )
}
