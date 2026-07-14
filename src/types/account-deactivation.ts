export type DeactivationReason =
  | 'too_expensive'
  | 'missing_features'
  | 'switched_tools'
  | 'no_longer_needed'
  | 'other'

export type AccountDeactivation = {
  id: string
  org_id: string | null
  user_id: string | null
  deactivated_by: string
  reason: DeactivationReason
  feedback: string | null
  deactivated_at: string
  reactivated_at: string | null
}
