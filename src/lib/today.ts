const SYDNEY_TZ = 'Australia/Sydney'

function sydneyOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYDNEY_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const offset = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+10:00'
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 600 // fallback: AEST, no daylight saving
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

/** Start/end of the Australia/Sydney calendar day containing `now`, as real UTC instants. */
export function getTodayBoundsSydney(now = new Date()): { todayStart: Date; todayEnd: Date } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [year, month, day] = ymd.split('-').map(Number)
  const offsetMinutes = sydneyOffsetMinutes(now)
  const todayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60_000)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return { todayStart, todayEnd }
}

/** The Australia/Sydney calendar date containing `now`, as a plain YYYY-MM-DD string —
 *  for comparing against date (not timestamptz) columns like `next_billing_date`. */
export function getTodaySydneyDateString(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}
