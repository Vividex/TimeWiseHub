import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ManagerExpenseView from '@/components/expenses/ManagerExpenseView'
import BusinessExpensesView from '@/components/expenses/BusinessExpensesView'
import SubscriptionsView from '@/components/expenses/SubscriptionsView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { Vehicle } from '@/types/vehicles'

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

  let vehicleList: Vehicle[] = []
  if (isManager && membership?.org_id) {
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', membership.org_id)
      .eq('is_archived', false)
      .order('registration_number')
    vehicleList = (vehicles ?? []) as Vehicle[]
  }

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl space-y-6">
        <ExpenseForm categories={categories ?? []} userId={user.id} orgId={membership?.org_id ?? null} />
        <SubscriptionsView userId={user.id} orgId={membership?.org_id ?? null} categories={categories ?? []} />
        <ExpenseList initialExpenses={expenses ?? []} categories={categories ?? []} userId={user.id} />
        {isManager && membership?.org_id && (
          <BusinessExpensesView userId={user.id} orgId={membership.org_id} categories={categories ?? []} canApprove={isAdminOrOwner} vehicles={vehicleList} />
        )}
        {isManager && membership?.org_id && <ManagerExpenseView orgId={membership.org_id} />}
      </div>
    </div>
  )
}
