import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ManagerExpenseView from '@/components/expenses/ManagerExpenseView'
import SubscriptionsView from '@/components/expenses/SubscriptionsView'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: categories }, { data: membership }] = await Promise.all([
    supabase.from('expenses').select('*, expense_categories(name)').eq('user_id', user.id).order('expense_date', { ascending: false }),
    supabase.from('expense_categories').select('id, name').order('name'),
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
  ])

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">Back to dashboard</a>
        </div>

        <ExpenseForm categories={categories ?? []} userId={user.id} orgId={membership?.org_id ?? null} />
        <SubscriptionsView userId={user.id} />
        <ExpenseList initialExpenses={expenses ?? []} categories={categories ?? []} userId={user.id} />
        {isManager && membership?.org_id && <ManagerExpenseView orgId={membership.org_id} />}

      </div>
    </div>
  )
}
