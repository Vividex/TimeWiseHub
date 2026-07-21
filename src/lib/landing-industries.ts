import type { StaticImageData } from 'next/image'

import generalDashboardImage from '../../promo/pc dashboard.png'
import generalInsightsImage from '../../promo/pc insights.png'
import generalInvoicesImage from '../../promo/pc invoices.png'
import generalRosteringImage from '../../promo/pc rostering.png'
import generalClientImage from '../../promo/pc client.png'
import generalVehiclesImage from '../../promo/pc vehicles.png'
import generalFinanceImage from '../../promo/pc finance.png'
import generalAssistantImage from '../../promo/pc ai.png'
import generalChatImage from '../../promo/pc team chat.png'
import generalHrProfilesImage from '../../promo/pc hr profiles.png'
import generalProjectsImage from '../../promo/pc clients projects and tasks.png'

import tutorsDashboardImage from '../../promo/tutoring-dashboard.png'
import tutorsStudentsImage from '../../promo/tutoring-students.png'
import tutorsSubjectsImage from '../../promo/tutoring-subjects.png'
import tutorsSessionsImage from '../../promo/tutoring-sessions.png'
import tutorsInvoicesImage from '../../promo/tutoring-invoices.png'
import tutorsFinanceImage from '../../promo/tutoring-finance.png'

export type IndustryId = 'general' | 'tutors'

export interface ShowcaseItem {
  label: string
  image: StaticImageData
  alt: string
}

export interface FeatureCard {
  title: string
  body: string
  href: string
}

export interface IndustryContent {
  id: IndustryId
  dropdownLabel: string
  heroBadge: string
  heroHeadline: string
  heroSubheading: string
  heroValueItems: string[]
  heroStats: { label: string; value: string }[]
  heroImage: StaticImageData
  heroImageAlt: string
  featuresHeading: string
  featuresSubheading: string
  featureCards: FeatureCard[]
  showcaseHeading: string
  showcaseSubheading: string
  showcaseImages: ShowcaseItem[]
}

export const INDUSTRIES: Record<IndustryId, IndustryContent> = {
  general: {
    id: 'general',
    dropdownLabel: 'All businesses',
    heroBadge: 'All-in-one business management platform',
    heroHeadline: 'Everything your team needs, in one place.',
    heroSubheading:
      'Manage projects, time, invoices, rosters, vehicles, expenses, team communication and AI-powered workflows from one platform.',
    heroValueItems: [
      'Australian business focused',
      'Secure data',
      'Built for small teams',
      'All tools in one place',
    ],
    heroStats: [
      { label: 'Core tools unified', value: '12+' },
      { label: 'Setup path', value: 'Free' },
      { label: 'Business view', value: '360' },
    ],
    heroImage: generalDashboardImage,
    heroImageAlt: 'TimeWiseHub dashboard overview',
    featuresHeading: 'The operating layer for modern small teams.',
    featuresSubheading:
      'TimeWiseHub brings the daily work of running a business into one focused, professional workspace.',
    featureCards: [
      {
        title: 'Time tracking',
        body: 'Capture billable and internal time with clean approvals and week-by-week visibility.',
        href: '#showcase',
      },
      {
        title: 'Projects and tasks',
        body: 'Plan client work, assign tasks, track progress and keep documents close to the work.',
        href: '#showcase',
      },
      {
        title: 'Invoices and quotes',
        body: 'Create branded quotes and invoices, send them to clients and monitor payment status.',
        href: '#showcase',
      },
      {
        title: 'Rosters and leave',
        body: 'Build rosters, manage availability, approve leave and keep shifts connected to timesheets.',
        href: '#showcase',
      },
      {
        title: 'Vehicle tracking',
        body: 'Track rego, servicing and odometer readings for every company vehicle, with costs feeding straight into expenses.',
        href: '#showcase',
      },
      {
        title: 'Team chat and video',
        body: 'Keep team conversations, direct messages, groups and scheduled calls in the same workspace.',
        href: '#showcase',
      },
      {
        title: 'AI assistant',
        body: 'Use AI-powered workflows to search business context, draft actions and move faster.',
        href: '#showcase',
      },
      {
        title: 'Insights and reporting',
        body: 'See revenue, project health, time trends and operational metrics without spreadsheet work.',
        href: '#showcase',
      },
      {
        title: 'Clients and sessions',
        body: 'Manage clients, progress notes, sessions, payments and project history from one profile.',
        href: '#showcase',
      },
    ],
    showcaseHeading: 'Real product screens, polished for every workflow.',
    showcaseSubheading:
      'Browse the dashboard, insights, invoices, roster, clients, assistant, chat, team and project views. Hover the showcase to pause the motion.',
    showcaseImages: [
      { label: 'Dashboard', image: generalDashboardImage, alt: 'TimeWiseHub dashboard screen' },
      { label: 'Insights', image: generalInsightsImage, alt: 'TimeWiseHub insights and reporting screen' },
      { label: 'Invoices', image: generalInvoicesImage, alt: 'TimeWiseHub invoices screen' },
      { label: 'Roster', image: generalRosteringImage, alt: 'TimeWiseHub rostering screen' },
      { label: 'Clients', image: generalClientImage, alt: 'TimeWiseHub client management screen' },
      { label: 'Vehicles', image: generalVehiclesImage, alt: 'TimeWiseHub vehicle tracking screen' },
      { label: 'Finance', image: generalFinanceImage, alt: 'TimeWiseHub company finance screen' },
      { label: 'Assistant', image: generalAssistantImage, alt: 'TimeWiseHub AI assistant screen' },
      { label: 'Chat', image: generalChatImage, alt: 'TimeWiseHub team chat screen' },
      { label: 'Team', image: generalHrProfilesImage, alt: 'TimeWiseHub HR profiles screen' },
      { label: 'Projects', image: generalProjectsImage, alt: 'TimeWiseHub clients projects and tasks screen' },
    ],
  },
  tutors: {
    id: 'tutors',
    dropdownLabel: 'Tutors & tutoring businesses',
    heroBadge: 'Built for tutoring & education businesses',
    heroHeadline: 'Everything your tutoring business needs, in one place.',
    heroSubheading:
      'Manage students and parents, bill per lesson, track subjects and topics, and share progress reports — all from one platform built for tutors.',
    heroValueItems: [
      'Parent & student profiles',
      'Per-lesson billing',
      'Subject & topic tracking',
      'Progress reports built in',
    ],
    heroStats: [
      { label: 'Setup path', value: 'Free' },
      { label: 'Billing model', value: 'Per-lesson' },
      { label: 'Progress tracking', value: 'Built-in' },
    ],
    heroImage: tutorsDashboardImage,
    heroImageAlt: 'TimeWiseHub tutoring dashboard overview',
    featuresHeading: 'Built around how tutoring actually works.',
    featuresSubheading:
      'TimeWiseHub brings students, parents, curriculum and billing into one focused workspace made for tutors.',
    featureCards: [
      {
        title: 'Students & parents',
        body: 'Keep a profile for every student, linked to their parent or guardian, so family details and progress are always in one place.',
        href: '#showcase',
      },
      {
        title: 'Per-lesson billing',
        body: 'Bill by the lesson instead of a flat retainer — invoices draw straight from completed sessions.',
        href: '#showcase',
      },
      {
        title: 'Subjects, topics & year levels',
        body: 'Organise your curriculum by subject and year group, and upload worksheets against each topic.',
        href: '#showcase',
      },
      {
        title: 'Progress reports',
        body: 'Share progress notes and reports with parents after every lesson, without a separate app.',
        href: '#showcase',
      },
      {
        title: 'Lesson scheduling',
        body: 'Book recurring or one-off lessons and see completed vs upcoming lessons at a glance.',
        href: '#showcase',
      },
      {
        title: 'Video lessons',
        body: 'Run lessons over video with screen sharing and worksheet annotation built in.',
        href: '#showcase',
      },
      {
        title: 'Invoices & quotes',
        body: 'Send branded invoices per family and track paid, sent and overdue status in one view.',
        href: '#showcase',
      },
      {
        title: 'Guided onboarding',
        body: 'A hands-on tutorial walks new tutors through the platform in a couple of minutes.',
        href: '#showcase',
      },
    ],
    showcaseHeading: 'Real screens from a working tutoring business.',
    showcaseSubheading:
      'Browse the dashboard, students, subjects, sessions and invoices views — built for how tutoring businesses actually run. Hover the showcase to pause the motion.',
    showcaseImages: [
      { label: 'Dashboard', image: tutorsDashboardImage, alt: 'TimeWiseHub tutoring dashboard screen' },
      { label: 'Students', image: tutorsStudentsImage, alt: 'TimeWiseHub students and parents screen' },
      { label: 'Subjects', image: tutorsSubjectsImage, alt: 'TimeWiseHub subjects and topics screen' },
      { label: 'Sessions', image: tutorsSessionsImage, alt: 'TimeWiseHub lesson scheduling screen' },
      { label: 'Invoices', image: tutorsInvoicesImage, alt: 'TimeWiseHub tutoring invoices screen' },
      { label: 'Finance', image: tutorsFinanceImage, alt: 'TimeWiseHub tutoring company finance screen' },
    ],
  },
}
