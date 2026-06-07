/** Round half-up to cents. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeGross(approvedSeconds: number, hourlyRate: number): number {
  return round2((approvedSeconds / 3600) * hourlyRate)
}

export function computeSuper(gross: number, superRatePct: number): number {
  return round2(gross * (superRatePct / 100))
}

/** Indicative only — employee's own assumed tax %. */
export function computeIndicativeNet(gross: number, taxPct: number): number {
  return round2(gross - gross * (taxPct / 100))
}
