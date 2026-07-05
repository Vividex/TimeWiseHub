import type { SupabaseClient } from '@supabase/supabase-js'
import { getWorkspaceProfile } from './registry'
import type { WorkspaceProfileConfig } from './types'

export async function getWorkspaceProfileForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceProfileConfig> {
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (membership?.org_id) {
    const { data: org } = await supabase
      .from('organisations')
      .select('workspace_profile')
      .eq('id', membership.org_id)
      .maybeSingle()
    return getWorkspaceProfile(org?.workspace_profile ?? 'generic')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_profile')
    .eq('id', userId)
    .maybeSingle()
  return getWorkspaceProfile(profile?.workspace_profile ?? 'generic')
}
