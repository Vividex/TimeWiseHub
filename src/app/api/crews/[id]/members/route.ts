import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: crewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  if (!['owner', 'admin'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { userId } = await req.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const { error } = await supabase
    .from('crew_members')
    .upsert({ crew_id: crewId, user_id: userId })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
