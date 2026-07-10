export type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'annually'
export type ReviewStatus = 'submitted' | 'approved' | 'rejected'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  submitted: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
}
export const REVIEW_STATUS_COLOUR: Record<ReviewStatus, string> = {
  submitted: 'bg-amber-50 text-amber-600',
  approved: 'bg-green-50 text-green-600',
  rejected: 'bg-red-50 text-red-600',
}

export function addInterval(dateStr: string, interval: RecurrenceInterval): string {
  const date = new Date(`${dateStr}T00:00:00`)
  switch (interval) {
    case 'weekly': date.setDate(date.getDate() + 7); break
    case 'fortnightly': date.setDate(date.getDate() + 14); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'annually': date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().slice(0, 10)
}

/** Days from the viewer's local "today" until `dateStr` — negative means overdue. */
export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
