import { redirect } from 'next/navigation'
export default function LegacyReportsRedirect() {
  redirect('/dashboard/insights?tab=export')
}
