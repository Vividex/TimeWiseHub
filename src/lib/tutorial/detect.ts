import type { SupabaseClient } from '@supabase/supabase-js'
import type { TutorialContext } from './types'

type DetectArgs = {
  userId: string
  orgId: string | null
  startedAt: string
  context: TutorialContext
}

export async function checkStep(
  supabase: SupabaseClient,
  stepId: string,
  args: DetectArgs
): Promise<{ done: boolean; context?: TutorialContext }> {
  const { userId, orgId, startedAt, context } = args

  switch (stepId) {
    case 'client': {
      const query = orgId
        ? supabase.from('clients').select('id, name').or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('clients').select('id, name').eq('owner_id', userId)
      const { data } = await query.gte('created_at', startedAt).order('created_at', { ascending: false }).limit(1)
      const row = data?.[0]
      return row ? { done: true, context: { clientId: row.id, clientName: row.name } } : { done: false }
    }
    case 'student': {
      if (!context.clientId) return { done: false }
      const { count } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('client_id', context.clientId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'subjects': {
      const { count } = await supabase.from('topic_assets').select('id', { count: 'exact', head: true })
        .eq('created_by', userId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'program': {
      const query = orgId
        ? supabase.from('programs').select('id', { count: 'exact', head: true }).or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('programs').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
      const { count } = await query.gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'project': {
      const query = orgId
        ? supabase.from('projects').select('id', { count: 'exact', head: true }).or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
      const { count } = await query.gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'session': {
      if (!context.clientId) return { done: false }
      const { count } = await supabase.from('sessions').select('id', { count: 'exact', head: true })
        .eq('client_id', context.clientId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'video_call': {
      const { count } = await supabase.from('scheduled_calls').select('id', { count: 'exact', head: true })
        .eq('created_by', userId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    default:
      return { done: false }
  }
}
