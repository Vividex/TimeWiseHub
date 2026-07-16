// src/app/api/address-lookup/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type MapboxSuggestion = {
  mapbox_id: string
  name: string
  full_address?: string
  place_formatted?: string
}

/**
 * Proxies Mapbox's Search Box `suggest` endpoint so the access token stays
 * server-side. Convenience-only feature — on any failure (unconfigured
 * token, network error, bad response) this returns an empty suggestion
 * list rather than an error, so address fields always still work as plain
 * text inputs.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const session = searchParams.get('session')?.trim()

  if (!q || q.length < 3 || !session) {
    return NextResponse.json({ suggestions: [] })
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ suggestions: [] })
  }

  const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest')
  url.searchParams.set('q', q)
  url.searchParams.set('session_token', session)
  url.searchParams.set('access_token', token)
  url.searchParams.set('country', 'au')
  url.searchParams.set('language', 'en')
  url.searchParams.set('limit', '5')
  url.searchParams.set('types', 'address')

  let response: Response
  try {
    response = await fetch(url.toString())
  } catch {
    return NextResponse.json({ suggestions: [] })
  }

  if (!response.ok) {
    return NextResponse.json({ suggestions: [] })
  }

  const data = await response.json().catch(() => null) as { suggestions?: MapboxSuggestion[] } | null
  const suggestions = (data?.suggestions ?? []).map(s => ({
    id: s.mapbox_id,
    address: s.full_address ?? [s.name, s.place_formatted].filter(Boolean).join(', '),
  }))

  return NextResponse.json({ suggestions })
}
