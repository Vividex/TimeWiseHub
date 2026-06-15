import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  if (!membership?.org_id) return NextResponse.json([])

  const { data: crews, error } = await supabase
    .from('crews')
    .select('id, name, manager_id, crew_members(user_id)')
    .eq('org_id', membership.org_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(crews ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  if (!membership?.org_id) return NextResponse.json({ error: 'Not in an org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json() as { name: string; managerId: string }
  if (!body.name?.trim() || !body.managerId) {
    return NextResponse.json({ error: 'Name and manager required' }, { status: 400 })
  }

  const { data: crew, error } = await supabase
    .from('crews')
    .insert({ org_id: membership.org_id, name: body.name.trim(), manager_id: body.managerId })
    .select('id, name, manager_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(crew)
}
