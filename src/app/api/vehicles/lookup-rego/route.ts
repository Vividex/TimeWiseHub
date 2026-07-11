// src/app/api/vehicles/lookup-rego/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const AU_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'ACT', 'NT', 'WA', 'TAS'])

type LookupResult = {
  make: string | null
  model: string | null
  year: number | null
  regoExpiryDate: string | null
}

/**
 * Field names below are a best-effort match against regcheck.org.uk's public JSON
 * pattern (the underlying broker behind CarRegistrationAPI.com's AU service) —
 * verify against the real docs once real credentials exist (info@carregistrationapi.com),
 * see the plan doc's "Important caveat on Task 4" note. Parsed defensively so a field
 * being named slightly differently doesn't crash the route, just returns nulls for
 * that field.
 */
function parseLookupResponse(raw: unknown): LookupResult {
  const data = (raw ?? {}) as Record<string, unknown>

  function textField(...keys: string[]): string | null {
    for (const key of keys) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (value && typeof value === 'object' && 'CurrentTextValue' in value) {
        const nested = (value as { CurrentTextValue?: unknown }).CurrentTextValue
        if (typeof nested === 'string' && nested.trim()) return nested.trim()
      }
    }
    return null
  }

  const yearText = textField('RegistrationYear', 'Year', 'year')
  const year = yearText ? parseInt(yearText, 10) : null

  return {
    make: textField('CarMake', 'Make', 'make'),
    model: textField('CarModel', 'Model', 'model'),
    year: Number.isFinite(year) ? year : null,
    regoExpiryDate: textField('RegistrationExpiry', 'ExpiryDate', 'expiryDate') ?? null,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { registrationNumber?: string; state?: string } | null
  const registrationNumber = body?.registrationNumber?.trim().toUpperCase()
  const state = body?.state?.trim().toUpperCase()

  if (!registrationNumber || !state || !AU_STATES.has(state)) {
    return NextResponse.json({ error: 'A registration number and a valid Australian state are required.' }, { status: 400 })
  }

  const apiKey = process.env.CAR_REGO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Rego lookup is not configured yet.' }, { status: 503 })
  }

  const url = new URL('https://www.regcheck.org.uk/api/json.aspx')
  url.searchParams.set('RegistrationNumber', registrationNumber)
  url.searchParams.set('username', apiKey)

  let response: Response
  try {
    response = await fetch(url.toString())
  } catch {
    return NextResponse.json({ error: 'Could not reach the rego lookup service.' }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Rego lookup failed (${response.status}).` }, { status: 502 })
  }

  const raw = await response.json().catch(() => null)
  if (!raw) {
    return NextResponse.json({ error: 'Rego lookup returned an unreadable response.' }, { status: 502 })
  }

  const result = parseLookupResponse(raw)
  if (!result.make && !result.model && !result.regoExpiryDate) {
    return NextResponse.json({ error: 'No details found for that registration number.' }, { status: 404 })
  }

  return NextResponse.json(result)
}
