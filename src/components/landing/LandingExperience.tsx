'use client'

import { useState } from 'react'
import Navbar from '@/components/landing/Navbar'
import HeroSection from '@/components/landing/HeroSection'
import FeatureCarousel from '@/components/landing/FeatureCarousel'
import PricingSection from '@/components/landing/PricingSection'
import Footer from '@/components/landing/Footer'
import { INDUSTRIES, type IndustryId } from '@/lib/landing-industries'

export default function LandingExperience() {
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryId>('general')
  const industry = INDUSTRIES[selectedIndustry]

  return (
    <>
      <Navbar selectedIndustry={selectedIndustry} onIndustryChange={setSelectedIndustry} />
      <HeroSection industry={industry} />
      <FeatureCarousel industry={industry} />
      <PricingSection />
      <Footer />
    </>
  )
}
