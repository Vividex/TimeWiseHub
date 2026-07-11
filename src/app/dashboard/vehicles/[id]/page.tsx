import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VehicleDetailClient, {
  type ExpenseCategoryOption,
  type OrgMemberOption,
  type VehicleExpense,
} from '@/components/vehicles/VehicleDetailClient'
import type { Vehicle, VehicleOdometerLog } from '@/types/vehicles'

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .eq('is_archived', false)
    .maybeSingle()

  if (!vehicle) notFound()

  const currentVehicle = vehicle as Vehicle

  const [
    { data: odometerLogs },
    { data: linkedExpenses },
    { data: membership },
    { data: members },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('vehicle_odometer_logs')
      .select('*')
      .eq('vehicle_id', currentVehicle.id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, org_id, user_id, category_id, amount, currency, description, expense_date, receipt_path, status, expense_categories(name)')
      .eq('vehicle_id', currentVehicle.id)
      .eq('is_business', true)
      .order('expense_date', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('role, org_id')
      .eq('org_id', currentVehicle.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentVehicle.org_id),
    supabase
      .from('expense_categories')
      .select('id, name')
      .order('name'),
  ])

  const canEdit = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const canDelete = ['owner', 'admin'].includes(membership?.role ?? '')
  const canLog = canEdit || currentVehicle.assigned_user_id === user.id

  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  return (
    <div className="min-h-full bg-gray-50 px-4 py-8 dark:bg-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <VehicleDetailClient
          vehicle={currentVehicle}
          odometerLogs={(odometerLogs ?? []) as VehicleOdometerLog[]}
          expenses={(linkedExpenses ?? []) as unknown as VehicleExpense[]}
          members={memberOptions}
          categories={(categories ?? []) as ExpenseCategoryOption[]}
          userId={user.id}
          canEdit={canEdit}
          canDelete={canDelete}
          canLog={canLog}
        />
      </div>
    </div>
  )
}
