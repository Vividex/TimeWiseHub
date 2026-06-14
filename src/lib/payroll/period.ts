export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/**
 * ISO date (YYYY-MM-DD) → period boundaries. UTC math avoids TZ drift.
 * weekStartDay: 0=Sun, 1=Mon … 6=Sat (JS getUTCDay() convention). Default 1 (Monday).
 * All existing callers omit weekStartDay and continue to get Monday-anchored periods.
 */
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
  weekStartDay = 1,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${anchorISO}T00:00:00Z`)

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { periodStart: iso(start), periodEnd: iso(end) }
  }

  const day = d.getUTCDay() // 0=Sun..6=Sat
  const offset = (day - weekStartDay + 7) % 7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - offset)
  const span = cadence === 'weekly' ? 6 : 13
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + span)
  return { periodStart: iso(start), periodEnd: iso(end) }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
