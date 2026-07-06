import Link from 'next/link'
import { Folder } from 'lucide-react'

export default function FolderTile({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-800 dark:hover:bg-slate-800"
    >
      <Folder size={20} className="shrink-0 text-cyan-500" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}
