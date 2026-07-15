export type ClientSite = {
  id: string
  client_id: string
  label: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}
