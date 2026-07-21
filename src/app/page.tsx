import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import LandingExperience from '@/components/landing/LandingExperience'

export const metadata: Metadata = {
  title: 'TimeWise Hub | All-in-One Business Management Platform',
  description:
    'TimeWise Hub helps businesses manage projects, time tracking, invoices, rosters, vehicles, expenses, team communication and AI-powered workflows in one platform.',
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="landing">
      <LandingExperience />
    </main>
  )
}
