import type { QuietHours } from '@/lib/chat/types'

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: true,
  days: [1, 2, 3, 4, 5], // Mon–Fri
  start: '09:00',
  end: '17:00',
}

/** Merge stored (possibly partial/missing) prefs with defaults. */
export function resolveQuietHours(raw: unknown): QuietHours {
  if (!raw || typeof raw !== 'object') return DEFAULT_QUIET_HOURS
  const q = raw as Partial<QuietHours>
  // Guard: empty days array would block ALL notifications — fall back to default
  const days = Array.isArray(q.days) && q.days.length > 0 ? q.days : DEFAULT_QUIET_HOURS.days
  return {
    enabled: typeof q.enabled === 'boolean' ? q.enabled : DEFAULT_QUIET_HOURS.enabled,
    days,
    start: typeof q.start === 'string' ? q.start : DEFAULT_QUIET_HOURS.start,
    end: typeof q.end === 'string' ? q.end : DEFAULT_QUIET_HOURS.end,
  }
}

/** ISO weekday (Mon=1…Sun=7) for an instant in a given IANA timezone. */
function isoWeekdayInTz(now: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[wd] ?? 1
}

/** "HH:MM" local clock time for an instant in a given IANA timezone. */
function hhmmInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
}

/**
 * True when it is OK to notify `now` for a recipient in `tz` given quiet hours.
 * If quiet hours are disabled, any time is allowed.
 */
export function isWithinWorkingHours(now: Date, tz: string, qh: QuietHours): boolean {
  if (!qh.enabled) return true
  const day = isoWeekdayInTz(now, tz)
  if (!qh.days.includes(day)) return false
  const t = hhmmInTz(now, tz)
  return t >= qh.start && t <= qh.end // zero-padded HH:MM compares lexicographically
}
