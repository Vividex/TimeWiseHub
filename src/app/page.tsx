import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Navbar from '@/components/landing/Navbar'
import HeroSection from '@/components/landing/HeroSection'
import FeatureCarousel from '@/components/landing/FeatureCarousel'
import PricingSection from '@/components/landing/PricingSection'
import Footer from '@/components/landing/Footer'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="landing">
      <Navbar />
      <HeroSection />
      <FeatureCarousel />
      <PricingSection />
      <Footer />
    </main>
  )
}
