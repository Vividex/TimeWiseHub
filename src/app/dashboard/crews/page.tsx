import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import CrewManager from '@/components/crews/CrewManager'
import type { OrgMember, CrewData } from '@/components/crews/CrewManager'

export default async function CrewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership?.org_id) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <p className="text-sm text-gray-500">You need to be in an organisation to use crews.</p>
      </div>
    )
  }

  const { org_id: orgId, role } = membership
  const isAdmin = ['owner', 'admin'].includes(role)

  // Fetch all org members with profiles
  const { data: orgMembersRaw } = await supabase
    .from('organisation_members')
    .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email)')
    .eq('org_id', orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgMembers: OrgMember[] = (orgMembersRaw ?? []).map((m: any) => ({
    userId: m.user_id as string,
    role: m.role as string,
    displayName: (m.profiles?.full_name ?? m.profiles?.email ?? m.user_id) as string,
  }))

  const memberLookup = new Map(orgMembers.map(m => [m.userId, m.displayName]))

  // Fetch all crews in the org
  const { data: crewsRaw } = await supabase
    .from('crews')
    .select('id, name, manager_id')
    .eq('org_id', orgId)
    .order('name')

  const crewIds = (crewsRaw ?? []).map(c => c.id)

  // Fetch all crew memberships in one query
  const { data: crewMembersRaw } = crewIds.length > 0
    ? await supabase.from('crew_members').select('crew_id, user_id').in('crew_id', crewIds)
    : { data: [] as { crew_id: string; user_id: string }[] }

  const crewMemberMap = new Map<string, string[]>()
  for (const cm of crewMembersRaw ?? []) {
    const arr = crewMemberMap.get(cm.crew_id) ?? []
    arr.push(cm.user_id)
    crewMemberMap.set(cm.crew_id, arr)
  }

  const allCrews: CrewData[] = (crewsRaw ?? []).map(c => ({
    id: c.id,
    name: c.name,
    managerId: c.manager_id,
    managerName: memberLookup.get(c.manager_id) ?? c.manager_id,
    members: (crewMemberMap.get(c.id) ?? []).map(uid => ({
      userId: uid,
      displayName: memberLookup.get(uid) ?? uid,
    })),
  }))

  // Non-admins only see crews they belong to
  const visibleCrews = isAdmin
    ? allCrews
    : allCrews.filter(c => c.members.some(m => m.userId === user.id))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Crews</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin
              ? 'Group employees into crews to route approval workflows to specific managers.'
              : 'Your crew assignments and their managers.'}
          </p>
        </div>
        <CrewManager
          initialCrews={visibleCrews}
          orgMembers={orgMembers}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  )
}
