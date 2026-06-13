import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const targetUserId = req.nextUrl.searchParams.get('user_id') ?? user.id
  const { data, error } = await supabase
    .from('employee_profiles').select('*').eq('user_id', targetUserId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user_id, org_id, job_title, start_date, emergency_contact_name, emergency_contact_phone, avatar_url } = await req.json()
  const { data, error } = await supabase
    .from('employee_profiles')
    .upsert({ user_id, org_id, job_title, start_date, emergency_contact_name, emergency_contact_phone, avatar_url, updated_at: new Date().toISOString() })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
