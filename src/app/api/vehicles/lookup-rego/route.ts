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
 * CheckAustralia (regcheck.org.uk / carregistrationapi.com) is a .NET ASMX
 * webservice. A plain HTTP GET returns an XML <Vehicle> document whose useful
 * data is duplicated as a JSON string inside a <vehicleJson> element — there is
 * no separate pure-JSON endpoint. Field names below are confirmed against the
 * vendor's own API reference PDF (not a guess): CarMake/MakeDescription,
 * ModelDescription, RegistrationYear, Expiry, State. Expiry is DD/MM/YYYY (or ""
 * when a state doesn't expose it — NSW's own sample never includes it at all).
 * Parsed defensively so a field named slightly differently for a given state
 * doesn't crash the route, just returns null for that field.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractVehicleJson(xml: string): unknown {
  const match = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/)
  if (!match) return null
  try {
    return JSON.parse(decodeXmlEntities(match[1]))
  } catch {
    return null
  }
}

function toIsoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

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
  const expiryText = textField('Expiry', 'RegistrationExpiry', 'ExpiryDate', 'expiryDate')

  return {
    make: textField('CarMake', 'MakeDescription', 'Make', 'make'),
    model: textField('ModelDescription', 'CarModel', 'Model', 'model'),
    year: Number.isFinite(year) ? year : null,
    regoExpiryDate: expiryText ? toIsoDate(expiryText) : null,
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

  const url = new URL('https://www.regcheck.org.uk/api/reg.asmx/CheckAustralia')
  url.searchParams.set('RegistrationNumber', registrationNumber)
  url.searchParams.set('State', state)
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

  const xml = await response.text()
  const raw = extractVehicleJson(xml)
  if (!raw) {
    return NextResponse.json({ error: 'Rego lookup returned an unreadable response.' }, { status: 502 })
  }

  const result = parseLookupResponse(raw)
  if (!result.make && !result.model && !result.regoExpiryDate) {
    return NextResponse.json({ error: 'No details found for that registration number.' }, { status: 404 })
  }

  return NextResponse.json(result)
}
