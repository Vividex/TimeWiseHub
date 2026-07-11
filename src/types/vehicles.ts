export type Vehicle = {
  id: string
  org_id: string
  registration_number: string
  year: number | null
  make: string | null
  model: string | null
  assigned_user_id: string | null
  current_odometer_km: number | null
  next_service_due_date: string | null
  next_service_due_km: number | null
  rego_expiry_date: string | null
  state: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}

export type VehicleOdometerLog = {
  id: string
  vehicle_id: string
  odometer_km: number
  logged_at: string
  logged_by: string | null
  driven_by: string | null
  notes: string | null
  created_at: string
}
