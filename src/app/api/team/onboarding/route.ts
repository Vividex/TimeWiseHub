import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = req.nextUrl.searchParams.get('org_id')
  const targetUserId = req.nextUrl.searchParams.get('user_id') ?? user.id
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
  const [{ data: checklist }, { data: progress }] = await Promise.all([
    supabase.from('onboarding_checklists').select('items').eq('org_id', orgId).maybeSingle(),
    supabase.from('onboarding_progress').select('item_label, completed_at').eq('user_id', targetUserId).eq('org_id', orgId),
  ])
  return NextResponse.json({ items: checklist?.items ?? [], progress: progress ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { org_id, items } = await req.json()
  const { data, error } = await supabase
    .from('onboarding_checklists').upsert({ org_id, items }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user_id, org_id, item_label, completed } = await req.json()
  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert({ user_id, org_id, item_label, completed_at: completed ? new Date().toISOString() : null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
