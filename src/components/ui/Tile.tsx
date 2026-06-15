// src/components/ui/Tile.tsx
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

type Tone = 'blue' | 'amber' | 'green' | 'gray' | 'red' | 'cyan'

const BADGE_TONES: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-green-100 text-green-700',
  gray: 'bg-gray-100 text-gray-600',
  red: 'bg-red-100 text-red-700',
  cyan: 'bg-cyan-100 text-cyan-700',
}

export type TileProps = {
  title: string
  meta?: string
  stat?: string | number
  icon?: LucideIcon
  accent?: string
  progress?: { done: number; total: number }
  badge?: { label: string; tone: Tone }
  href?: string
  onClick?: () => void
}

function TileInner({ title, meta, stat, icon: Icon, accent, progress, badge }: TileProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {(Icon || accent) && (
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={accent ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
            >
              {Icon ? <Icon size={18} /> : <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-bold leading-snug text-gray-900 dark:text-slate-100">{title}</p>
            {meta && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{meta}</p>}
          </div>
        </div>
        {badge && (
          <span className={`w-fit shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${BADGE_TONES[badge.tone]}`}>
            {badge.label}
          </span>
        )}
      </div>

      {stat !== undefined && (
        <p className="text-2xl font-black text-gray-900 dark:text-slate-100">{stat}</p>
      )}

      {progress && progress.total > 0 && (
        <div className="mt-auto">
          <div className="mb-1 flex justify-between text-xs font-semibold text-gray-400">
            <span>{progress.done}/{progress.total} done</span>
            <span>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div
              className="h-1.5 rounded-full bg-cyan-500"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const SHELL =
  'rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30'

export function Tile(props: TileProps) {
  if (props.href) {
    return (
      <Link href={props.href} className={`block ${SHELL}`}>
        <TileInner {...props} />
      </Link>
    )
  }
  return (
    <button type="button" onClick={props.onClick} className={SHELL}>
      <TileInner {...props} />
    </button>
  )
}

export function TileGrid({
  children,
  empty,
}: {
  children: React.ReactNode
  empty?: React.ReactNode
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  if (isEmpty && empty) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm font-semibold text-gray-400 dark:border-slate-700">
        {empty}
      </p>
    )
  }
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}
