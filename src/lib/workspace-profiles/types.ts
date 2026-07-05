export type WorkspaceProfileKey =
  | 'generic'
  | 'tutoring'
  | 'personal_training'
  | 'builder_construction'
  | 'trades_field_services'
  | 'consulting'
  | 'healthcare'
  | 'real_estate'
  | 'cleaning_maintenance'
  | 'creative_agencies'

export type TerminologyKey = 'client' | 'session' | 'program' | 'project'

export type Terminology = Record<TerminologyKey, string>

export type WorkspaceProfileConfig = {
  key: WorkspaceProfileKey
  label: string
  terminology: Terminology
}
