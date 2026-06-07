export type PayCadence = 'weekly' | 'fortnightly' | 'monthly'

/** ISO date (YYYY-MM-DD) → period boundaries. UTC math avoids TZ drift. */
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${anchorISO}T00:00:00Z`)

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { periodStart: iso(start), periodEnd: iso(end) }
  }

  const day = d.getUTCDay() // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - mondayOffset)
  const span = cadence === 'weekly' ? 6 : 13
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + span)
  return { periodStart: iso(start), periodEnd: iso(end) }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
