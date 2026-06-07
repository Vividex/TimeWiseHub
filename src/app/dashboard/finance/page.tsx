import { redirect } from 'next/navigation'
import { resolveRole } from '@/lib/auth/resolve-role'
import { isPeriod, type Period } from '@/lib/finance/period'
import CompanyFinanceView, { type FinanceScope } from '@/components/finance/CompanyFinanceView'
import TeamApprovalsView from '@/components/finance/TeamApprovalsView'
import EmployeeFinanceView from '@/components/finance/EmployeeFinanceView'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const ctx = await resolveRole()
  if (!ctx) redirect('/login')

  const params = await searchParams
  const period: Period = isPeriod(params.period) ? params.period : 'month'

  // Owner / admin of an org → company P&L.
  if (ctx.isFinancial && ctx.orgId) {
    const scope: FinanceScope = { type: 'org', orgId: ctx.orgId }
    return (
      <CompanyFinanceView scope={scope} period={period} currentUserId={ctx.userId} currentOrgId={ctx.orgId} />
    )
  }

  // Solo user (no organisation) → personal P&L, preserving prior behaviour.
  if (!ctx.orgId) {
    const scope: FinanceScope = { type: 'user', userId: ctx.userId }
    return (
      <CompanyFinanceView scope={scope} period={period} currentUserId={ctx.userId} currentOrgId={null} />
    )
  }

  // Manager → team hours + own pay placeholder.
  if (ctx.role === 'manager') {
    return <TeamApprovalsView orgId={ctx.orgId} />
  }

  // Employee → own data only.
  return <EmployeeFinanceView userId={ctx.userId} />
}
