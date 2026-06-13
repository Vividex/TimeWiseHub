import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId } = await request.json() as { orgId: string }

  // Verify the caller is actually a member of that org before accepting the cookie
  const { count } = await supabase
    .from('organisation_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('user_id', user.id)

  if (!count || count === 0) {
    return NextResponse.json({ error: 'Not a member of this organisation' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('active_org_id', orgId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
}
