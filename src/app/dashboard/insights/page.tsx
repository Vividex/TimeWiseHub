import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import InsightsTabs from '@/components/insights/InsightsTabs'
import { OverviewPanel } from './OverviewPanel'
import { ActivityPanel } from '../activity/ActivityPanel'
import { ExportPanel } from '../reports/ExportPanel'

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab } = await searchParams
  const defaultTab = tab === 'activity' || tab === 'export' ? tab : 'overview'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <InsightsTabs
          defaultTab={defaultTab}
          overview={<OverviewPanel />}
          activity={<ActivityPanel />}
          exportPanel={<ExportPanel />}
        />
      </div>
    </div>
  )
}
