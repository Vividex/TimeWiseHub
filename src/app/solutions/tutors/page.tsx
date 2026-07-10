import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import Navbar from '@/components/landing/Navbar'
import TutorHeroSection from '@/components/landing/TutorHeroSection'
import TutorFeatureCarousel from '@/components/landing/TutorFeatureCarousel'
import PricingSection from '@/components/landing/PricingSection'
import Footer from '@/components/landing/Footer'

export const metadata: Metadata = {
  title: 'TimeWiseHub for Tutors | All-in-One Tutoring Business Platform',
  description:
    'TimeWiseHub for tutors and tutoring businesses: manage students and parents, bill per lesson, track subjects and topics, share progress reports and run video lessons — all in one platform.',
}

export default async function TutorsSolutionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="landing">
      <Navbar />
      <TutorHeroSection />
      <TutorFeatureCarousel />
      <PricingSection />
      <Footer />
    </main>
  )
}
