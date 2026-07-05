import type { WorkspaceProfileConfig, WorkspaceProfileKey } from './types'

const GENERIC_TERMINOLOGY = {
  client: 'Client',
  session: 'Session',
  program: 'Program',
  project: 'Project',
} as const

export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
  generic: {
    key: 'generic',
    label: 'Other / Not Listed',
    terminology: GENERIC_TERMINOLOGY,
  },
  tutoring: {
    key: 'tutoring',
    label: 'Tutoring & Education',
    terminology: { client: 'Student', session: 'Lesson', program: 'Course', project: 'Learning Plan' },
  },
  personal_training: {
    key: 'personal_training',
    label: 'Personal Training & Fitness',
    terminology: { client: 'Member', session: 'Appointment', program: 'Training Plan', project: 'Package' },
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
