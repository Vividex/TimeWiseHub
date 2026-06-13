import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isTeamPlan, maxActiveProjects } from '@/lib/subscription'

type ProjectPayload = {
  org_id?: string | null
  name?: string
  description?: string | null
  colour?: string
  due_date?: string | null
  client_id?: string | null
  budget_hours?: number | null
  budget_dollars?: number | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = (await req.json()) as ProjectPayload
  const name = payload.name?.trim()
  if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

  const subscription = await getSubscription(user.id)
  const service = createServiceClient()
  const orgId = payload.org_id ?? null

  if (orgId) {
    const { data: membership } = await service
      .from('organisation_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this organisation' }, { status: 403 })
    }

    const { data: ownerRow } = await service
      .from('organisation_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .maybeSingle()

    if (ownerRow) {
      const ownerSubscription = await getSubscription(ownerRow.user_id)
      if (!isTeamPlan(ownerSubscription)) {
        return NextResponse.json({ error: 'Business plan required for organisation projects' }, { status: 402 })
      }
    }
  }

  const limit = maxActiveProjects(subscription)
  if (limit !== Infinity) {
    const { count } = await service
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('status', 'active')

    if ((count ?? 0) >= limit) {
      return NextResponse.json({ error: `Free plan is limited to ${limit} active projects` }, { status: 402 })
    }
  }

  const { error } = await service.from('projects').insert({
    owner_id: user.id,
    org_id: orgId,
    name,
    description: payload.description || null,
    colour: payload.colour || '#2563eb',
    due_date: payload.due_date || null,
    client_id: payload.client_id || null,
    budget_hours: payload.budget_hours ?? null,
    budget_dollars: payload.budget_dollars ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
