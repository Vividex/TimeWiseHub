export type IncidentType = 'injury' | 'near_miss' | 'hazard'
export type IncidentSeverity = 'minor' | 'moderate' | 'serious' | 'critical'
export type IncidentStatus = 'open' | 'closed'

export type IncidentReport = {
  id: string
  org_id: string
  type: IncidentType
  severity: IncidentSeverity
  occurred_at: string
  location: string | null
  client_id: string | null
  site_id: string | null
  description: string
  employee_id: string | null
  witness_ids: string[]
  body_part: string | null
  first_aid_given: boolean | null
  medical_treatment_required: boolean | null
  time_off_work: boolean | null
  root_cause: string | null
  corrective_action: string | null
  status: IncidentStatus
  filed_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

export type IncidentReportPhoto = {
  id: string
  incident_report_id: string
  storage_path: string
  uploaded_by: string
  created_at: string
}
