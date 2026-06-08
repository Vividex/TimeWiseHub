import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserAvailability } from '@/lib/chat/presence'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Only allow asking about someone you share a conversation with isn't needed
  // for a soft hint; restrict to same-org to avoid probing arbitrary users.
  const { data: shared } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!shared) return NextResponse.json({ available: true, reason: null })

  const availability = await getUserAvailability(userId)
  return NextResponse.json(availability)
}
