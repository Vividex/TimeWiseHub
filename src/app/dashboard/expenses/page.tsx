import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ManagerExpenseView from '@/components/expenses/ManagerExpenseView'
import BusinessExpensesView from '@/components/expenses/BusinessExpensesView'
import SubscriptionsView from '@/components/expenses/SubscriptionsView'
import VehiclesView from '@/components/vehicles/VehiclesView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { Vehicle } from '@/types/vehicles'
import type { OrgMemberOption } from '@/components/vehicles/VehiclesView'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: categories }, { data: membership }, subscription] = await Promise.all([
    supabase.from('expenses').select('*, expense_categories(name)').eq('user_id', user.id).order('expense_date', { ascending: false }),
    supabase.from('expense_categories').select('id, name').order('name'),
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const isAdminOrOwner = ['owner', 'admin'].includes(membership?.role ?? '')
  const canSeeVehicles = Boolean(membership?.org_id && isTeamPlan(subscription))

  const [{ data: vehicles }, { data: members }] = canSeeVehicles && membership?.org_id
    ? await Promise.all([
        supabase
          .from('vehicles')
          .select('*')
          .eq('org_id', membership.org_id)
          .eq('is_archived', false)
          .order('registration_number'),
        supabase
          .from('organisation_members')
          .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
          .eq('org_id', membership.org_id),
      ])
    : [{ data: [] }, { data: [] }]

  const vehicleList = (vehicles ?? []) as Vehicle[]
  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  // RLS already scopes vehicleList to what this user can see (their own assigned
  // vehicle, their crew's, or everything for manager+) — only show the section at
  // all if there's something to show, or if they're a manager who can add one.
  const showVehicles = isManager || vehicleList.length > 0

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl space-y-6">
        <ExpenseForm categories={categories ?? []} userId={user.id} orgId={membership?.org_id ?? null} />
        <SubscriptionsView userId={user.id} orgId={membership?.org_id ?? null} categories={categories ?? []} />
        <ExpenseList initialExpenses={expenses ?? []} categories={categories ?? []} userId={user.id} />
        {showVehicles && membership?.org_id && (
          <VehiclesView vehicles={vehicleList} orgId={membership.org_id} members={memberOptions} canManage={isManager} />
        )}
        {isManager && membership?.org_id && (
          <BusinessExpensesView userId={user.id} orgId={membership.org_id} categories={categories ?? []} canApprove={isAdminOrOwner} vehicles={vehicleList} />
        )}
        {isManager && membership?.org_id && <ManagerExpenseView orgId={membership.org_id} />}

      </div>
    </div>
  )
}
