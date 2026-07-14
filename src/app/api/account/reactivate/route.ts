import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  const service = createServiceClient()
  const now = new Date().toISOString()

  if (membership?.org_id) {
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can reactivate the account.' }, { status: 403 })
    }

    const { data: org } = await service
      .from('organisations').select('deactivated_at').eq('id', membership.org_id).maybeSingle()
    if (!org?.deactivated_at) return NextResponse.json({ error: 'Account is not deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('organisations').update({ deactivated_at: null }).eq('id', membership.org_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { data: lastDeactivation } = await service
      .from('account_deactivations')
      .select('id')
      .eq('org_id', membership.org_id)
      .is('reactivated_at', null)
      .order('deactivated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDeactivation) {
      await service.from('account_deactivations').update({ reactivated_at: now }).eq('id', lastDeactivation.id)
    }
  } else {
    const { data: profile } = await service
      .from('profiles').select('deactivated_at').eq('id', user.id).maybeSingle()
    if (!profile?.deactivated_at) return NextResponse.json({ error: 'Account is not deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('profiles').update({ deactivated_at: null }).eq('id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { data: lastDeactivation } = await service
      .from('account_deactivations')
      .select('id')
      .eq('user_id', user.id)
      .is('reactivated_at', null)
      .order('deactivated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDeactivation) {
      await service.from('account_deactivations').update({ reactivated_at: now }).eq('id', lastDeactivation.id)
    }
  }

  return NextResponse.json({ success: true })
}
