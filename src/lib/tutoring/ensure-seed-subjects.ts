import { DEFAULT_SUBJECTS } from './constants'
import type { createClient } from '@/lib/supabase-server'

export async function ensureSeedSubjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string | null
) {
  const scoped = orgId
    ? supabase.from('subjects').select('id').eq('org_id', orgId).limit(1)
    : supabase.from('subjects').select('id').is('org_id', null).eq('created_by', userId).limit(1)

  const { data: existing } = await scoped
  if (existing && existing.length > 0) return

  await supabase.from('subjects').insert(
    DEFAULT_SUBJECTS.map(name => ({ name, org_id: orgId, created_by: userId }))
  )
}
