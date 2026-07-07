import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()

  const orgId = membership?.org_id ?? null
  const profile = await getWorkspaceProfileForUser(supabase, user.id)

  const { error } = await supabase
    .from('user_onboarding_dismissed')
    .upsert({
      user_id: user.id,
      org_id: orgId,
      started_at: new Date().toISOString(),
      current_step_index: 0,
      context: {},
      dismissed_at: null,
      profile_key: profile.key,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
