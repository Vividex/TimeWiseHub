import { createClient } from '@/lib/supabase-server'

export type MemberRole = 'owner' | 'admin' | 'manager' | 'employee'

export type RoleFlags = {
  /** owner or admin — full financial visibility */
  isFinancial: boolean
  /** owner, admin, or manager — can approve / see team hours */
  isManager: boolean
}

/** Pure: derive visibility flags from a role. No I/O. */
export function deriveRoleFlags(role: MemberRole | null): RoleFlags {
  return {
    isFinancial: role === 'owner' || role === 'admin',
    isManager: role === 'owner' || role === 'admin' || role === 'manager',
  }
}

export type RoleContext = {
  userId: string
  orgId: string | null
  role: MemberRole | null
} & RoleFlags

/** Resolve the signed-in user's org role. Returns null if not authenticated. */
export async function resolveRole(): Promise<RoleContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = (membership?.role ?? null) as MemberRole | null

  return {
    userId: user.id,
    orgId: membership?.org_id ?? null,
    role,
    ...deriveRoleFlags(role),
  }
}
