export type Period = 'month' | 'quarter' | 'year' | 'all'

export const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month',
  quarter: 'This Quarter',
  year: 'This Year',
  all: 'All Time',
}

export function isPeriod(value: string | undefined): value is Period {
  return value === 'month' || value === 'quarter' || value === 'year' || value === 'all'
}

export function getPeriodRange(period: Period): { from: string | null; to: string | null } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)

  if (period === 'all') return { from: null, to: null }

  if (period === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to }
  }

  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3)
    return { from: new Date(now.getFullYear(), quarter * 3, 1).toISOString().slice(0, 10), to }
  }

  return { from: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), to }
}
