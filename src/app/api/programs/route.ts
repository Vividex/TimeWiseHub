import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members').select('org_id')
    .eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data, error } = orgId
    ? await service.from('programs')
        .select('*')
        .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
    : await service.from('programs')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description, cover_colour, icon, org_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const service = createServiceClient()

  if (org_id) {
    const { data: membership } = await service
      .from('organisation_members').select('role')
      .eq('user_id', user.id).eq('org_id', org_id).maybeSingle()
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await service.from('programs').insert({
    owner_id: user.id,
    org_id: org_id ?? null,
    name: name.trim(),
    description: description?.trim() || null,
    cover_colour: cover_colour || '#06b6d4',
    icon: icon || 'library',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
