export type SwmsAcknowledgment = {
  userId: string
  acknowledgedAt: string
}

export type HrcwCategory =
  | 'falls_2m'
  | 'telecom_tower'
  | 'demolition_load_bearing'
  | 'asbestos_disturbance'
  | 'structural_alteration_temp_support'
  | 'confined_space'
  | 'trench_shaft_1_5m'
  | 'tunnel'
  | 'explosives'
  | 'pressurised_gas_mains'
  | 'chemical_fuel_refrigerant_lines'
  | 'energised_electrical'
  | 'contaminated_flammable_atmosphere'
  | 'tiltup_precast_concrete'
  | 'traffic_corridor'
  | 'powered_mobile_plant'
  | 'temperature_extremes'
  | 'water_drowning_risk'

export type HrwlClass =
  | 'SB' | 'SI' | 'SA'
  | 'DG' | 'RB' | 'RI' | 'RA'
  | 'CT' | 'CS' | 'CD' | 'CP' | 'CB' | 'CV' | 'CN' | 'C2' | 'C6' | 'C1' | 'C0'
  | 'HM' | 'HP'
  | 'LF' | 'LO'
  | 'BB' | 'BI' | 'TO' | 'ES'
  | 'RS'
  | 'WP'

export type SwmsRow = {
  jobStep: string
  hazard: string
  control: string
}

export type SwmsAuthoredContent = {
  category: HrcwCategory
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
}

export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  category: HrcwCategory | null
  source: 'uploaded' | 'authored'
  acknowledgments: SwmsAcknowledgment[]
}
