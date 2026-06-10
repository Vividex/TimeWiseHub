import { redirect } from 'next/navigation'
export default function LegacyActivityRedirect() {
  redirect('/dashboard/insights?tab=activity')
}
