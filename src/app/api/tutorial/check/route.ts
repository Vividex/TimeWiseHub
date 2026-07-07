import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkStep } from '@/lib/tutorial/detect'

export async function GET(req: Request) {
  const stepId = new URL(req.url).searchParams.get('stepId')
  if (!stepId) return NextResponse.json({ error: 'Missing stepId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row, error } = await supabase
    .from('user_onboarding_dismissed')
    .select('org_id, started_at, context')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!row?.started_at) return NextResponse.json({ done: false })

  const result = await checkStep(supabase, stepId, {
    userId: user.id,
    orgId: row.org_id,
    startedAt: row.started_at,
    context: row.context as Record<string, string>,
  })

  return NextResponse.json(result)
}
