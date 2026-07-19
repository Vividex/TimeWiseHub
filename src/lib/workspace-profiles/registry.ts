import type { WorkspaceProfileConfig, WorkspaceProfileKey, Terminology } from './types'

const GENERIC_TERMINOLOGY: Terminology = {
  client: { singular: 'Client', plural: 'Clients' },
  session: { singular: 'Session', plural: 'Sessions' },
  program: { singular: 'Program', plural: 'Programs' },
  project: { singular: 'Project', plural: 'Projects' },
}

const TRADES_TERMINOLOGY: Terminology = { ...GENERIC_TERMINOLOGY, project: { singular: 'Job', plural: 'Jobs' } }
const REAL_ESTATE_TERMINOLOGY: Terminology = { ...GENERIC_TERMINOLOGY, project: { singular: 'Listing', plural: 'Listings' } }

const HIDE_SUBJECTS_NAV = { hiddenHrefs: ['/dashboard/subjects', '/dashboard/students'] }

export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
  generic: {
    key: 'generic',
    label: 'Other / Not Listed',
    terminology: GENERIC_TERMINOLOGY,
    navOverrides: HIDE_SUBJECTS_NAV,
  },
  tutoring: {
    key: 'tutoring',
    label: 'Tutoring & Education',
    terminology: {
      client: { singular: 'Client', plural: 'Clients' },
      session: { singular: 'Lesson', plural: 'Lessons' },
      program: { singular: 'Lesson Plan', plural: 'Lesson Plans' },
      project: { singular: 'Learning Plan', plural: 'Learning Plans' },
    },
  },
  personal_training: {
    key: 'personal_training',
    label: 'Personal Training & Fitness',
    terminology: {
      client: { singular: 'Member', plural: 'Members' },
      session: { singular: 'Appointment', plural: 'Appointments' },
      program: { singular: 'Training Plan', plural: 'Training Plans' },
      project: { singular: 'Package', plural: 'Packages' },
    },
    navOverrides: HIDE_SUBJECTS_NAV,
  },
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true, supportsSwms: true },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: REAL_ESTATE_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: TRADES_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV, supportsMultiSite: true },
  creative_agencies: { key: 'creative_agencies', label: 'Creative Agencies & Marketing', terminology: GENERIC_TERMINOLOGY, navOverrides: HIDE_SUBJECTS_NAV },
}

export function getWorkspaceProfile(key: string): WorkspaceProfileConfig {
  return WORKSPACE_PROFILES[key as WorkspaceProfileKey] ?? WORKSPACE_PROFILES.generic
}
