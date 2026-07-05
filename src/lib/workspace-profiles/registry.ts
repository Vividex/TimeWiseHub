import type { WorkspaceProfileConfig, WorkspaceProfileKey, Terminology } from './types'

const GENERIC_TERMINOLOGY: Terminology = {
  client: { singular: 'Client', plural: 'Clients' },
  session: { singular: 'Session', plural: 'Sessions' },
  program: { singular: 'Program', plural: 'Programs' },
  project: { singular: 'Project', plural: 'Projects' },
}

export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
  generic: {
    key: 'generic',
    label: 'Other / Not Listed',
    terminology: GENERIC_TERMINOLOGY,
  },
  tutoring: {
    key: 'tutoring',
    label: 'Tutoring & Education',
    terminology: {
      client: { singular: 'Client', plural: 'Clients' },
      session: { singular: 'Lesson', plural: 'Lessons' },
      program: { singular: 'Course', plural: 'Courses' },
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
  },
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY },
  creative_agencies: { key: 'creative_agencies', label: 'Creative Agencies & Marketing', terminology: GENERIC_TERMINOLOGY },
}

export function getWorkspaceProfile(key: string): WorkspaceProfileConfig {
  return WORKSPACE_PROFILES[key as WorkspaceProfileKey] ?? WORKSPACE_PROFILES.generic
}
