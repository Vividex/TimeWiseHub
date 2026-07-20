import { Loader2 } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <Loader2 size={28} className="animate-spin text-cyan-600 dark:text-cyan-400" />
    </div>
  )
}
