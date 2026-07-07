import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type AdvanceBody = {
  stepIndex: number
  context?: Record<string, string>
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as AdvanceBody

  const { data: row, error: selectError } = await supabase
    .from('user_onboarding_dismissed')
    .select('context')
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 400 })

  const existingContext = (row?.context ?? {}) as Record<string, string>
  const merged = { ...existingContext, ...(body.context ?? {}) }

  const { error } = await supabase
    .from('user_onboarding_dismissed')
    .update({ current_step_index: body.stepIndex, context: merged })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
