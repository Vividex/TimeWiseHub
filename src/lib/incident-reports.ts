import type { IncidentSeverity, IncidentStatus, IncidentType } from '@/types/incident-reports'

export const TYPE_LABEL: Record<IncidentType, string> = {
  injury: 'Injury',
  near_miss: 'Near miss',
  hazard: 'Hazard',
}

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
  critical: 'Critical',
}

export const SEVERITY_COLOUR: Record<IncidentSeverity, string> = {
  minor: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  serious: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  closed: 'Closed',
}

export const STATUS_COLOUR: Record<IncidentStatus, string> = {
  open: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  closed: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
}
