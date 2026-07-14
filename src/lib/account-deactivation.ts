import type { DeactivationReason } from '@/types/account-deactivation'

export const REASON_LABEL: Record<DeactivationReason, string> = {
  too_expensive: 'Too expensive',
  missing_features: 'Missing features I need',
  switched_tools: 'Switched to another tool',
  no_longer_needed: 'No longer need it',
  other: 'Other',
}

export function formatTenure(createdAt: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
  if (days < 1) return 'less than a day'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths ? `${years}y ${remMonths}m` : `${years} year${years === 1 ? '' : 's'}`
}
