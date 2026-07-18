import type { HrcwCategory, HrwlClass, SwmsRow } from '@/types/swms'

export const HRWL_CLASSES: HrwlClass[] = [
  'SB', 'SI', 'SA', 'DG', 'RB', 'RI', 'RA',
  'CT', 'CS', 'CD', 'CP', 'CB', 'CV', 'CN', 'C2', 'C6', 'C1', 'C0',
  'HM', 'HP', 'LF', 'LO', 'BB', 'BI', 'TO', 'ES', 'RS', 'WP',
]

export const HRCW_CATEGORY_LABELS: Record<HrcwCategory, string> = {
  falls_2m: 'Risk of a person falling more than 2 metres',
  telecom_tower: 'Work carried out on a telecommunication tower',
  demolition_load_bearing: 'Demolition of a load-bearing (or structurally significant) element',
  asbestos_disturbance: 'Work that involves, or is likely to involve, disturbance of asbestos',
  structural_alteration_temp_support: 'Structural alterations or repairs requiring temporary support to prevent collapse',
  confined_space: 'Work carried out in or near a confined space',
  trench_shaft_1_5m: 'Work in or near a shaft or trench with excavated depth greater than 1.5 metres',
  tunnel: 'Work in or near a tunnel',
  explosives: 'Use of explosives',
  pressurised_gas_mains: 'Work on or near pressurised gas distribution mains or piping',
  chemical_fuel_refrigerant_lines: 'Work on or near chemical, fuel, or refrigerant lines',
  energised_electrical: 'Work on or near energised electrical installations or services',
  contaminated_flammable_atmosphere: 'Work in an area that may have a contaminated or flammable atmosphere',
  tiltup_precast_concrete: 'Work involving tilt-up or precast concrete',
  traffic_corridor: 'Work on, in, or adjacent to a road, railway, shipping lane, or other traffic corridor in use by traffic other than pedestrians',
  powered_mobile_plant: 'Work in an area with any movement of powered mobile plant',
  temperature_extremes: 'Work in an area with artificial extremes of temperature',
  water_drowning_risk: 'Work in or near water or other liquid involving a risk of drowning',
}

export type SwmsTemplate = {
  category: HrcwCategory
  rows: SwmsRow[]
  ppe: string[]
  hrwlClasses: HrwlClass[]
  licenceNote: string
  sources: string[]
}

export const SWMS_TEMPLATES: SwmsTemplate[] = [
  {
    category: 'falls_2m',
    rows: [
      { jobStep: 'Plan the task and select fall protection', hazard: 'Fall from height causing serious injury or death', control: 'Apply the fall-protection hierarchy in order: fall prevention (edge protection/guardrails/scaffold) first, then a work-positioning (travel-restraint) system, then individual fall-arrest only if neither is practicable' },
      { jobStep: 'Erect edge protection or scaffold before work begins', hazard: 'Fall from an unprotected edge or roof', control: 'Install guardrails 900-1100mm high with mid-rail and toe-board, or an equivalent working platform, before work at height starts' },
      { jobStep: 'Erect edge protection or scaffold before work begins', hazard: 'Scaffold collapse or instability', control: 'Scaffold erected, altered, and dismantled only by a licensed scaffolder (or supervised trainee), built to AS/NZS 1576 and AS/NZS 4576, inspected before use and after any incident or repair' },
      { jobStep: 'Access the work area', hazard: 'Falls from ladders during entry or exit', control: "Use scaffold stairs or an EWP platform for entry where possible; portable ladders only where a safer system isn't practicable, never as a working platform" },
      { jobStep: "Work at height using individual fall-arrest where prevention/restraint isn't practicable", hazard: 'Anchor failure or excessive free-fall distance', control: 'Anchorage points rated and installed to AS/NZS 1891.4; harness attached at the dorsal or chest point only; free-fall limited to under 2 metres' },
      { jobStep: "Work at height using individual fall-arrest where prevention/restraint isn't practicable", hazard: 'Suspension trauma after an arrested fall', control: 'Documented rescue plan in place before work starts so a suspended worker is retrieved promptly' },
      { jobStep: 'Manage tools and materials at height', hazard: 'Dropped objects striking people below', control: 'Tool lanyards/tethering and a ground-level exclusion zone below the work area' },
    ],
    ppe: ['Full-body harness (dorsal/chest attachment)', 'Fall-arrest lanyard', 'Hard hat', 'Safety footwear'],
    hrwlClasses: ['SB', 'SI', 'SA', 'WP'],
    licenceNote: 'No licence is required for general work at height itself (RIIWHS204E competency covers it) — a High Risk Work Licence is only triggered if scaffold above the basic threshold is erected (Scaffolding SB/SI/SA), or a boom-type EWP of 11 metres or more is used to access height (WP).',
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risk-falls-workplaces',
      'https://www.safeworkaustralia.gov.au/sites/default/files/2022-10/Model%20Code%20of%20Practice%20-%20Construction%20Work%20-%2021102022%20.pdf',
    ],
  },
  {
    category: 'telecom_tower',
    rows: [
      { jobStep: 'Pre-climb checks', hazard: 'RF/EME (radio-frequency electromagnetic energy) exposure from live antennas', control: 'RF EME Awareness training completed; personal radiation monitor worn by each climber; work re-planned or antennas de-energised if levels exceed ARPANSA reference limits' },
      { jobStep: 'Climb/ascend the tower', hazard: 'Fall from height', control: 'Anchored fall-arrest harness to AS/NZS 1891.1, vertical anchorage line or twin-rope climbing system to AS/NZS 1891.4; minimum two trained personnel on site, one a competent supervisor' },
      { jobStep: 'Carry out work on the tower', hazard: 'Delayed rescue of a suspended or injured worker', control: 'Documented single-person tower-rescue capability on site (e.g. an IRATA-equivalent statement of attainment) plus a Tower Rescue Kit reaching the ground' },
      { jobStep: 'Carry out work on the tower', hazard: 'Dropped tools/equipment striking ground crew', control: 'Exclusion zone below active work; tools tethered' },
      { jobStep: 'Rig or hoist equipment onto the structure', hazard: 'Rigging/hoisting failure', control: 'Only appropriately licensed riggers (Dogging DG / Rigging RB-RI-RA) perform the corresponding tier of rigging work' },
      { jobStep: 'Communicate during remote-site work', hazard: 'Delayed emergency response at a remote site', control: 'Two-way radio, mobile, or satellite phone on site matched to actual coverage; on-site first aid/CPR-current personnel' },
    ],
    ppe: ['Full-body harness', 'Hard hat to AS 1800', 'Fall-arrest lanyards / emergency descent device', 'High-vis clothing', 'Gloves'],
    hrwlClasses: ['DG', 'RB', 'RI', 'RA', 'WP'],
    licenceNote: "There's no dedicated 'tower climbing licence' — the real requirements are a bundle of competencies (working-at-heights, tower rescue, RF/EME awareness, a height-workers medical clearance). A High Risk Work Licence only applies to the rigging component (Dogging/Rigging) if equipment is hoisted, or WP if a boom EWP ≥11m is used instead of climbing.",
    sources: [
      'https://www.safeworkaustralia.gov.au/sites/default/files/2022-10/Model%20Code%20of%20Practice%20-%20Construction%20Work%20-%2021102022%20.pdf',
      'https://baicommunications.com/wp-content/uploads/2023/12/Requirements-for-working-at-heights-and-rigging-on-BAI-Communications-Australia-sites-v3.2.pdf',
    ],
  },
  {
    category: 'demolition_load_bearing',
    rows: [
      { jobStep: 'Pre-demolition planning', hazard: 'Uncontrolled structural collapse from unknown building condition', control: "Obtain designer's safety report/as-built documentation; commission a structural engineer's investigation if unavailable or the structure is damaged/weakened" },
      { jobStep: 'Disconnect services', hazard: 'Contact with live/uncontrolled gas, electrical, water, or telecoms services', control: 'All services disconnected, isolated, capped, or otherwise rendered safe by a competent person before work starts; Dial Before You Dig checked for underground services' },
      { jobStep: 'Install temporary support before disturbing load-bearing elements', hazard: 'Unplanned collapse as lateral support is removed', control: 'Temporary braces, propping, shoring, or guys installed and checked for effectiveness as demolition proceeds; a structural engineer assesses loadings at each stage' },
      { jobStep: 'Install temporary support before disturbing load-bearing elements', hazard: 'Collapse affecting an adjoining building', control: 'Lateral support to adjoining structures maintained equal to or greater than before demolition; shoring/underpinning used where needed' },
      { jobStep: 'Carry out demolition in the engineered sequence', hazard: 'Struck by falling debris or plant', control: "Exclusion zones established and supervised so unauthorised persons can't enter" },
      { jobStep: 'Manage hazardous materials', hazard: 'Asbestos exposure', control: 'Assessed by a competent person and removed/managed under a separate licensed process before structural demolition proceeds' },
    ],
    ppe: ['Hard hat', 'High-vis clothing', 'Safety glasses', 'Hearing protection', 'Steel-cap boots', 'Gloves', 'RPE if dust/asbestos present'],
    hrwlClasses: ['RB', 'RI', 'RA', 'CT', 'CS', 'CD', 'CP', 'CB', 'CV', 'CN', 'C2', 'C6', 'C1', 'C0'],
    licenceNote: 'Demolition itself needs a state-issued demolition licence, not a national scheme — e.g. NSW requires an Unrestricted (DE1) or Restricted (DE2) Demolition Licence depending on scale, and other states run their own equivalent schemes. Not cross-checked against Certifications — confirm your crew/contractor holds the correct state licence. A High Risk Work Licence only applies to incidental rigging or crane work during the demolition.',
    sources: [
      'https://www.safeworkaustralia.gov.au/system/files/documents/1810/model-cop-demolition-work.pdf',
      'https://www.safework.nsw.gov.au/licences-and-registrations/licences/restricted-demolition-licence',
    ],
  },
  {
    category: 'asbestos_disturbance',
    rows: [
      { jobStep: 'Identify presence and type of asbestos', hazard: 'Unrecognised asbestos-containing material disturbed unintentionally', control: 'Check the asbestos register; assume presence if the building predates 1990 or condition is uncertain, confirmed by a competent person' },
      { jobStep: 'Determine licensing threshold', hazard: 'Unlicensed work exceeding the legal threshold', control: 'Class A licence required for any amount of friable asbestos; Class B for any amount of non-friable; unlicensed work only permitted for ≤10m² of non-friable material and associated minor contamination' },
      { jobStep: 'Set up the work area', hazard: 'Airborne fibre release', control: 'Wet method used wherever reasonably practicable; negative-pressure enclosure (minimum 12 Pa) for friable removal, tested for leaks; HEPA H-Class vacuum for residual dust, never a domestic vacuum' },
      { jobStep: 'Remove and dispose of material', hazard: 'Cross-contamination outside the work area', control: 'Decontamination facility used before exiting; waste double-bagged, sealed, labelled, and disposed of only at an EPA-licensed asbestos waste site' },
      { jobStep: 'Clearance and re-occupation', hazard: 'Re-occupying a still-contaminated space', control: 'Clearance inspection and written clearance certificate required before re-occupation for Class A work, including air monitoring' },
    ],
    ppe: ['Respirator rated to the specific task (P1/P2 minimum, up to full-face P3 PAPR or supplied-air for friable/dry stripping — see AS/NZS 1715 and AS/NZS 1716)', 'Disposable coveralls', 'Gloves', 'Safety footwear'],
    hrwlClasses: [],
    licenceNote: 'Not a High Risk Work Licence — requires a state-issued Class A (any friable) or Class B (non-friable only) Asbestos Removal Licence for anything above the ≤10m² non-friable unlicensed threshold, plus an independent licensed asbestos assessor for Class A air monitoring/clearance. Not cross-checked against Certifications — confirm your crew/contractor holds the correct class.',
    sources: ['https://www.safeworkaustralia.gov.au/doc/model-code-practice-how-safely-remove-asbestos'],
  },
  {
    category: 'structural_alteration_temp_support',
    rows: [
      { jobStep: 'Engage a structural engineer before touching the load-bearing element', hazard: 'Sudden collapse during alteration', control: 'Competent person (structural engineer) specifies the temporary support method and load path before any load-bearing element is disturbed' },
      { jobStep: 'Install temporary support', hazard: 'Support inadequate for the actual loads', control: "Props/bracing/shoring installed per the engineer's specification and checked for effectiveness as work proceeds" },
      { jobStep: 'Remove or alter the load-bearing element', hazard: 'Premature loss of support mid-alteration', control: 'Temporary support carries the load throughout; work sequenced exactly as specified' },
      { jobStep: 'Install the new permanent structural element', hazard: 'New element not yet load-rated', control: "New structure verified/certified by the engineer as adequate and cured before it takes load" },
      { jobStep: 'Remove temporary supports', hazard: 'Removing support before the permanent structure is ready', control: 'Temporary props/bracing remain in place until the permanent structure is confirmed adequate and fully cured' },
    ],
    ppe: ['Hard hat', 'Safety glasses', 'Gloves', 'Steel-cap boots', 'Hearing protection for cutting/demolition tools'],
    hrwlClasses: ['RB', 'RI', 'RA', 'CT', 'CS', 'CD', 'CP', 'CB', 'CV', 'CN', 'C2', 'C6', 'C1', 'C0'],
    licenceNote: 'No dedicated licence for this category as a whole — the real requirement is engineering sign-off from a competent structural engineer plus general trade competency for installing props/bracing. A High Risk Work Licence only applies if structural steel or precast elements are lifted/repositioned as part of the alteration.',
    sources: ['https://www.safeworkaustralia.gov.au/sites/default/files/2022-10/Model%20Code%20of%20Practice%20-%20Construction%20Work%20-%2021102022%20.pdf'],
  },
  {
    category: 'confined_space',
    rows: [
      { jobStep: 'Identify and classify the confined space', hazard: 'Space not recognised as confined until an incident occurs', control: 'Written risk assessment by a competent person before any entry is planned' },
      { jobStep: 'Isolate connected plant and services', hazard: 'Engulfment or entrapment from connected plant/services activating during entry', control: 'Lock, tag, close, or blank all connected hazardous plant/services before anyone enters; not removed until all workers confirmed out' },
      { jobStep: 'Test the atmosphere and issue an entry permit', hazard: 'Oxygen deficiency or enrichment', control: "Oxygen kept within 19.5%-23.5% by volume; air-supplied RPE provided if it can't be kept in range" },
      { jobStep: 'Test the atmosphere and issue an entry permit', hazard: 'Flammable atmosphere', control: 'Kept below 5% of Lower Explosive Limit where reasonably practicable; work does not proceed at or above 10% LEL' },
      { jobStep: 'Enter and carry out work', hazard: 'Difficulty rescuing a worker in distress', control: 'Access points sized for PPE-clad rescue; standby person maintains communication; rescue equipment listed on the entry permit' },
      { jobStep: 'Enter and carry out work', hazard: 'Toxic or stratified gases (heavier-than-air gases settle at the bottom)', control: 'Atmospheric testing at multiple levels and remote regions of the space, not just at the entry point' },
    ],
    ppe: ['Air-supplied RPE if oxygen is outside the safe range', 'Gas detector/atmospheric monitor', 'Harness and retrieval line for vertical entries', 'Communications equipment'],
    hrwlClasses: [],
    licenceNote: "No licence required for confined space entry — training by a competent person is required (the industry-standard unit is RIIWHS202E 'Enter and work in confined spaces', a statement of attainment, not a licence).",
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-confined-spaces',
      'https://training.gov.au/training/details/RIIWHS202E',
    ],
  },
  {
    category: 'trench_shaft_1_5m',
    rows: [
      { jobStep: 'Plan the excavation', hazard: 'Striking underground services', control: 'Before You Dig Australia (BYDA) referral completed; services potholed/exposed by hand or non-destructive methods within the marked tolerance zone before mechanical excavation' },
      { jobStep: 'Excavate to depth', hazard: 'Trench wall collapse burying or crushing workers', control: 'Shore, bench, or batter the sides based on soil classification; a competent person assesses whether support is required' },
      { jobStep: 'Set up the site', hazard: 'Falls into the excavation', control: "Barriers positioned at least 2 metres from the trench edge where possible; tape alone is not sufficient" },
      { jobStep: 'Manage spoil and plant', hazard: 'Spoil or plant surcharge collapsing the trench wall', control: 'Spoil heaps kept at least 0.9 metres from the trench edge' },
      { jobStep: 'Provide safe access', hazard: 'Inability to exit quickly in an emergency', control: 'Safe ladder access provided; trenches over 8 metres long have two access points' },
      { jobStep: 'Work in the excavation', hazard: 'Atmospheric hazards (exhaust fumes, oxygen deficiency) in a shaft', control: 'Prevent accumulation of vehicle/plant exhaust; monitor atmosphere as needed; nobody works alone in the excavation' },
    ],
    ppe: ['Hi-vis clothing', 'Hard hat', 'Steel-cap boots', 'Gloves', 'Hearing/eye protection when using breakers or compaction plant'],
    hrwlClasses: [],
    licenceNote: 'No dedicated licence — requires a competent person to assess ground conditions and specify shoring/benching/battering, plus general construction induction (White Card) for all site workers.',
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-excavation-work',
      'https://www.worksafe.act.gov.au/health-and-safety-portal/safety-by-industry/building-and-construction/trenching-and-excavation-work',
    ],
  },
  {
    category: 'tunnel',
    rows: [
      { jobStep: 'Design and plan the tunnel', hazard: 'Ground/rock face collapse from unassessed conditions', control: 'Geotechnical assessment and ground-support design (rock bolts, shotcrete, steel ribs) completed before excavation advances' },
      { jobStep: 'Excavate/advance the tunnel face', hazard: 'Rock falls or bursts, changing ground conditions', control: 'Probe drilling ahead of the face; ground support installed as soon as practicable after excavation; real-time monitoring of water pressure/ground movement' },
      { jobStep: 'Maintain the work environment', hazard: 'Oxygen deficiency, gas build-up, or diesel particulate/silica dust in a confined tunnel atmosphere', control: 'Mechanical ventilation and continuous atmospheric monitoring; confined-space entry training and RPE' },
      { jobStep: 'Maintain the work environment', hazard: 'Fire or explosion from fuel, batteries, or blast gases', control: 'Intrinsically safe equipment, hot-work permits, fire-rated cabling, safe fuel/chemical storage' },
      { jobStep: 'Operate plant within the tunnel', hazard: 'Struck-by or crush injury from tunnel boring machines/mobile plant in a restricted space', control: 'Proximity detection, lock-out/tag-out, dedicated pedestrian routes, spotters' },
    ],
    ppe: ['Helmet with head torch', 'High-vis clothing', 'Task-appropriate respiratory protection', 'Hearing protection', 'Self-rescuer device', 'Gas detector'],
    hrwlClasses: [],
    licenceNote: 'No dedicated licence for tunnelling itself — requires confined-space entry competency, general construction induction, and competent-person sign-off on ground support design.',
    sources: [
      'https://www.safeworkaustralia.gov.au/safety-topic/hazards/tunnelling',
      'https://www.safework.nsw.gov.au/__data/assets/pdf_file/0007/52873/Tunnels-Under-Construction-Code-of-Practice.pdf',
    ],
  },
  {
    category: 'explosives',
    rows: [
      { jobStep: 'Plan the blast', hazard: 'Uncontrolled flyrock/projectiles injuring people or damaging property', control: 'Licensed shotfirer develops a Blast Management Plan; exclusion zone sized per AS 2187.2; protective mats/blankets placed around structures' },
      { jobStep: 'Notify and establish the exclusion zone', hazard: 'Uncontrolled access to the blast area', control: 'Neighbours/authorities notified per state requirements; signage, spotters, and a confirmed all-clear communication protocol before firing' },
      { jobStep: 'Load, connect, and fire charges', hazard: 'Premature or uncontrolled detonation', control: 'Loading and firing performed only by the licensed shotfirer, following AS 2187.2' },
      { jobStep: 'Handle a misfire', hazard: 'Unexploded charge detonating unexpectedly during clearance', control: 'AS 2187.2 misfire procedures followed; only the shotfirer re-approaches the area' },
      { jobStep: 'Store and transport explosives', hazard: 'Uncontrolled storage/transport of explosives', control: 'Dedicated secure magazine storage; transport within licensed quantity limits' },
    ],
    ppe: ['Standard site PPE', 'Hearing protection near firing', 'Any PPE specified in the site Blast Management Plan'],
    hrwlClasses: [],
    licenceNote: "Not a High Risk Work Licence — requires a state-issued shotfirer's licence (a separate scheme, typically needing a security clearance, RTO statement of attainment, and medical clearance; varies by state).",
    sources: [
      'https://www.business.qld.gov.au/industries/mining-energy-water/explosives-fireworks/requirements/blasting/shotfirer-licence',
      'https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/licences/high-risk-work-licence-classes',
    ],
  },
  {
    category: 'pressurised_gas_mains',
    rows: [
      { jobStep: 'Plan and locate services', hazard: 'Striking a gas main or piping', control: 'Before You Dig Australia (BYDA) enquiry and review of as-built plans before any excavation' },
      { jobStep: 'Excavate near the main', hazard: 'Fracturing the main during excavation', control: 'Hand-dig or use non-destructive methods within the marked service tolerance zone; no augers or excavator buckets within it' },
      { jobStep: 'Coordinate with the asset owner', hazard: 'Work proceeding without utility awareness on a high-pressure main', control: 'Asset owner/utility notified and coordinated with before work on high-pressure mains' },
      { jobStep: 'Carry out the work', hazard: 'Gas leak, fire, or explosion from an ignited leak', control: 'Ignition sources eliminated, gas detection/atmosphere monitoring in place, no hot work near a suspected leak' },
      { jobStep: 'Test and commission', hazard: 'Non-compliant installation', control: 'Work carried out to AS/NZS 5601 Gas Installations by licensed personnel only' },
    ],
    ppe: ['Gas detector/monitor', 'Flame-resistant clothing for hot work', 'Hi-vis', 'Gloves', 'Eye protection'],
    hrwlClasses: [],
    licenceNote: "Not a High Risk Work Licence — requires a state-issued gasfitting licence (part of the plumbing/gasfitting scheme, not WHS-issued). Work on the distribution main itself additionally needs the specific network operator's authorisation. Not cross-checked against Certifications — confirm your crew holds the correct state licence.",
    sources: [
      'https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/plumbing-draining-and-gasfitting',
      'https://www.vba.vic.gov.au/registration-and-licensing/plumbing-registration-and-licensing/gasfitting',
    ],
  },
  {
    category: 'chemical_fuel_refrigerant_lines',
    rows: [
      { jobStep: 'Identify the line and its contents', hazard: 'Unknown or unexpected substance in the line', control: 'Safety Data Sheet reviewed before work starts' },
      { jobStep: 'Isolate or recover contents', hazard: 'Release of a hazardous or ozone-depleting substance', control: 'Line isolated/depressurised, or refrigerant recovered into approved equipment, before the line is opened — never vented to atmosphere' },
      { jobStep: 'Excavate near the line', hazard: 'Rupturing the line during excavation', control: 'Line located and exposed before mechanical digging; hand-dig within the tolerance zone' },
      { jobStep: 'Carry out the work', hazard: 'Fire or explosion from a flammable release', control: 'Ignition sources eliminated, gas/vapour monitoring in place, no hot work near a suspected leak' },
      { jobStep: 'Handle recovered substances', hazard: 'Environmental contamination from a spill or release', control: 'Recovered substance safely contained and stored; spill response plan followed' },
    ],
    ppe: ['Chemical-resistant gloves', 'Safety glasses/goggles', 'Substance-appropriate respiratory protection', 'Coveralls'],
    hrwlClasses: [],
    licenceNote: 'Not a High Risk Work Licence. Refrigerant work specifically requires an ARCtick Refrigerant Handling Licence (Australian Refrigeration Council scheme). Fuel-line and other chemical-line work is typically covered by plumbing/gasfitting or substance-specific licensing depending on what\'s in the line. Not cross-checked against Certifications — confirm the specific licence for the substance involved.',
    sources: ['https://safetydocs.safetyculture.com/swms/refrigerant-gas-safe-use-swms-10213'],
  },
  {
    category: 'energised_electrical',
    rows: [
      { jobStep: 'Plan the work', hazard: 'Electric shock or electrocution', control: 'De-energise wherever possible; energised work only proceeds where absolutely necessary (e.g. testing to confirm de-energisation) and never for convenience' },
      { jobStep: 'Isolate before work', hazard: 'Inadvertent re-energisation during work', control: 'Lock-out/tag-out and a permit-to-work system before work begins; tested to confirm de-energised' },
      { jobStep: "Work on energised equipment where de-energisation isn't possible", hazard: 'Arc flash or arc blast', control: 'Risk assessment by a competent person, arc-rated PPE, and a safe working distance maintained' },
      { jobStep: 'Work near overhead or underground lines', hazard: 'Contact with live powerlines by plant or persons', control: "Exclusion zones by voltage maintained (verify the current figures for your state's Electrical Safety Code of Practice before relying on them); a trained spotter used when plant must work near the zone" },
      { jobStep: 'Work near underground services', hazard: 'Contact with underground electrical services during excavation', control: 'BYDA enquiry and potholing/hand-digging within tolerance zones' },
    ],
    ppe: ['Insulated gloves and tools rated to the voltage', 'Arc-rated clothing where required', 'Safety glasses/face shield', 'Insulated footwear', 'Non-conductive hard hat'],
    hrwlClasses: [],
    licenceNote: 'Not a High Risk Work Licence — all electrical work must be performed by (or directly supervised by) a licensed electrician holding the relevant state electrical licence; work on service mains needs a further state-specific accreditation. Licensing is state-issued and varies by jurisdiction. Not cross-checked against Certifications — confirm your crew holds the correct state licence.',
    sources: [
      'https://www.safeworkaustralia.gov.au/system/files/documents/1810/model-cop-managing-electrical-risks-in-the-workplace.pdf',
      'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0022/27670/es-code-of-practice-working-near-overhead-underground-electric-lines.pdf',
    ],
  },
  {
    category: 'contaminated_flammable_atmosphere',
    rows: [
      { jobStep: 'Identify the hazard', hazard: 'Unrecognised contaminated or flammable atmosphere (e.g. residue in old fuel tanks or pipework)', control: 'Assessed by a competent person before work starts, per the Managing Risks of Hazardous Chemicals Code of Practice' },
      { jobStep: 'Eliminate ignition sources', hazard: 'Ignition of a flammable atmosphere', control: 'All potential ignition sources (flames, sparks, heat) identified and eliminated or isolated before work begins' },
      { jobStep: 'Test the atmosphere', hazard: 'Flammable gas concentration reaching an ignitable level', control: 'Kept below 5% of the Lower Explosive Limit throughout the work, monitored continuously' },
      { jobStep: 'Carry out the work', hazard: 'Exposure to residual hazardous chemicals', control: 'Handled per the Managing Risks of Hazardous Chemicals in the Workplace Code of Practice; RPE matched to the specific contaminant' },
      { jobStep: 'Use electrical equipment in the area', hazard: 'Equipment itself becoming an ignition source', control: 'Non-sparking tools and intrinsically safe electrical equipment used in the identified atmosphere' },
    ],
    ppe: ['RPE matched to the specific contaminant', 'Non-sparking tools', 'Flame-resistant clothing', 'Gas detector'],
    hrwlClasses: [],
    licenceNote: 'No licence — this is a risk-management and atmospheric-monitoring category, not a licensed activity.',
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risks-hazardous-chemicals-workplace',
      'https://www.safeworkaustralia.gov.au/duties-tool/construction/hazards-information/high-risk-construction-work-requiring-swms',
    ],
  },
  {
    category: 'tiltup_precast_concrete',
    rows: [
      { jobStep: 'Engineer the lift plan', hazard: 'Panel collapse or toppling from deficient design or inadequate temporary support', control: 'Engineered lift plan and temporary bracing design by a competent person for each panel, before casting or lifting begins' },
      { jobStep: 'Cast and cure the panel', hazard: 'Lifting before adequate strength is reached', control: 'Panel not lifted until concrete has reached the curing strength specified by the engineer' },
      { jobStep: 'Rig the panel', hazard: 'Rigging or lifting-gear failure', control: 'Only certified lifting gear used, connected by a licensed dogger/rigger' },
      { jobStep: 'Lift and place the panel', hazard: 'Struck-by injury from a suspended load', control: 'Exclusion zone maintained under and around the suspended panel; lift performed by a licensed crane operator' },
      { jobStep: 'Brace the panel after placement', hazard: 'Panel toppling before permanent connections are made', control: 'Temporary bracing installed immediately on placement and remains until the permanent structural connection is verified' },
      { jobStep: 'Remove temporary bracing', hazard: 'Bracing removed before the structure can carry its own load', control: 'Bracing only removed once the permanent connection is confirmed adequate by the engineer' },
    ],
    ppe: ['Hard hat', 'High-vis clothing', 'Gloves', 'Steel-cap boots', 'Eye protection'],
    hrwlClasses: ['DG', 'RB', 'RI', 'RA', 'CT', 'CS', 'CD', 'CP', 'CB', 'CV', 'CN', 'C2', 'C6', 'C1', 'C0'],
    licenceNote: '',
    sources: [
      'https://www.safeworkaustralia.gov.au/system/files/documents/1702/codeofpractice_precasttiltupandconcreteelementsbuildingconstruction_2008_pdf.pdf',
      'https://www.safeworkaustralia.gov.au/system/files/documents/1909/managing_risk_in_construction_-_prefabricated_concrete.pdf',
    ],
  },
  {
    category: 'traffic_corridor',
    rows: [
      { jobStep: 'Plan traffic management', hazard: 'Struck-by injury from moving vehicles, trains, or vessels', control: 'Hierarchy of controls applied: eliminate plant/vehicles from the workplace where possible, then substitute, isolate, engineer (physical barriers/exclusion zones), then administrative controls (signage, traffic controllers) before PPE' },
      { jobStep: 'Prepare a Traffic Management Plan / Traffic Guidance Scheme', hazard: 'Uncontrolled traffic entering the work zone', control: 'Plan prepared per the relevant state Traffic Management Code of Practice and the road/rail/port authority notified as required' },
      { jobStep: 'Install traffic control devices', hazard: 'Drivers/train operators not warned of the work zone in time', control: 'Signage and traffic control devices installed per the approved plan before work begins' },
      { jobStep: 'Carry out work within the controlled zone', hazard: 'Worker struck while working close to live traffic', control: 'Work stays within the protected/controlled work zone; conditions monitored and traffic control adjusted as they change' },
      { jobStep: 'Reinstate normal traffic flow', hazard: 'Traffic control removed prematurely', control: 'Devices removed and normal flow reinstated only once work is fully complete' },
    ],
    ppe: ['High-vis clothing (day/night rated to AS/NZS 4602.1 where relevant)', 'Traffic-controller-specific PPE'],
    hrwlClasses: [],
    licenceNote: 'No High Risk Work Licence — requires a state-issued Traffic Controller ticket for anyone directing traffic, and specific competency for preparing a traffic management plan. Rail corridor work typically needs separate rail-authority protection/possession arrangements beyond general road traffic control. Not cross-checked against Certifications — confirm your crew holds the correct ticket.',
    sources: [
      'https://www.safeworkaustralia.gov.au/sites/default/files/2021-04/Traffic%20management%20guide%20for%20construction.PDF',
      'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0018/22158/traffic-management-construction-cop-2008.pdf',
    ],
  },
  {
    category: 'powered_mobile_plant',
    rows: [
      { jobStep: 'Plan plant movement', hazard: 'Struck-by or crush injury from moving plant', control: "First control is separating workers from plant entirely; where that's not practicable, zone-based control is used (plant-only zones, plant-operating/restricted-personnel zones, plant-hazardous zones)" },
      { jobStep: 'Establish and induct workers on the zones', hazard: 'Workers unaware of live plant zones', control: "All workers inducted on the site's plant movement plan and zone boundaries before entering the area" },
      { jobStep: 'Operate plant with limited visibility', hazard: 'Blind spots around reversing or turning plant', control: 'Reversing alarms/cameras used; spotters positioned where visibility is limited' },
      { jobStep: 'Manage pedestrian movement', hazard: 'Pedestrians entering a live plant zone', control: 'Defined pedestrian routes kept separate from plant-operating zones; exclusion enforced' },
      { jobStep: 'Review after incidents', hazard: 'Repeat near-misses from an unreviewed plan', control: 'Vehicle/plant management plan reviewed and updated after any near miss or change in site conditions' },
    ],
    ppe: ["Hi-vis clothing matched to the site's plant-visibility requirements", 'Hard hat', 'Steel-cap boots'],
    hrwlClasses: ['DG', 'RB', 'RI', 'RA', 'CT', 'CS', 'CD', 'CP', 'CB', 'CV', 'CN', 'C2', 'C6', 'C1', 'C0', 'HM', 'HP', 'LF', 'LO', 'RS'],
    licenceNote: "A High Risk Work Licence only applies to the specific plant types the scheme actually covers — cranes, hoists, forklifts, dogging/rigging, reach stackers. Other mobile plant (excavators, dozers, graders, rollers) has no national HRWL requirement; operators need Verification of Competency (VOC) or the relevant RII training unit instead, which isn't tracked by this cross-check.",
    sources: ['https://www.safework.nsw.gov.au/__data/assets/pdf_file/0009/1394838/moving-plant-on-construction-sites-cop.pdf'],
  },
  {
    category: 'temperature_extremes',
    rows: [
      { jobStep: 'Plan work considering forecast conditions', hazard: 'Heat stress or heat stroke', control: 'Hierarchy of controls applied before PPE: eliminate/substitute/isolate/engineer (shade, air movement, cool water access), then administrative (scheduling, rest breaks, job rotation)' },
      { jobStep: 'Monitor conditions during work', hazard: 'Conditions worsening beyond safe limits during the shift', control: 'Temperature and humidity monitored throughout; additional controls (shaded rest areas, hydration breaks, job rotation) implemented as thresholds are approached, work stopped if the threshold set by the site risk assessment is exceeded' },
      { jobStep: 'Identify higher-risk workers', hazard: 'Workers with pre-existing conditions or heavy PPE load at greater risk', control: 'Higher-risk individuals identified during planning and given extra monitoring/breaks' },
      { jobStep: 'Provide rest and hydration facilities', hazard: 'Dehydration or inadequate recovery between work periods', control: 'Shaded or climate-controlled rest areas and cool drinking water provided' },
      { jobStep: 'Plan for cold conditions where relevant', hazard: 'Cold stress in low-temperature environments', control: 'Appropriate insulated clothing, warming breaks, and monitoring for cold-related illness' },
    ],
    ppe: ['Broad-brim hat, sunscreen, and light breathable clothing for heat', 'Insulated layered clothing for cold', 'Hydration supplies'],
    hrwlClasses: [],
    licenceNote: "No licence — this is purely a risk-management and administrative-control category. Specific temperature thresholds vary by state/current code — confirm the applicable figures for your state before relying on a fixed number.",
    sources: [
      'https://www.safeworkaustralia.gov.au/safety-topic/hazards/working-heat',
      'https://www.act.gov.au/__data/assets/pdf_file/0004/2979535/Managing-the-risks-associated-with-working-in-extreme-temperatures-factsheet.pdf',
    ],
  },
  {
    category: 'water_drowning_risk',
    rows: [
      { jobStep: 'Plan the task', hazard: 'Drowning from falling into water', control: "Physical barriers, edge protection, or handrails installed where reasonably practicable to prevent falling in at all — this is the first-choice control, ahead of PPE" },
      { jobStep: 'Prepare the work team', hazard: 'A worker entering the water with no one aware', control: 'Minimum two-person team; one maintains continuous visual contact with the other' },
      { jobStep: 'Don PPE before work near, on, or in water', hazard: 'Inability to stay afloat if a fall into water occurs', control: "A correctly fitted PFD/life jacket worn at all times where barriers aren't practicable or sufficient" },
      { jobStep: 'Prepare for an emergency', hazard: 'Delayed rescue after a fall into water', control: "A rescue plan developed and briefed to the team before work starts, wherever the risk assessment identifies it's needed" },
      { jobStep: 'Carry out the work', hazard: 'Slippery or unstable surfaces near water', control: 'Appropriate non-slip footwear used; work surfaces kept clear of standing water/algae where practicable' },
    ],
    ppe: ['PFD/life jacket (compliant with the relevant Australian Standard)', 'Non-slip footwear appropriate to wet surfaces'],
    hrwlClasses: [],
    licenceNote: 'No licence for surface work near water. Commercial diving is a separate, distinct activity with its own licensing scheme — this category covers drowning risk from working near/on/in water, not diving work.',
    sources: [
      'https://www.safeworkaustralia.gov.au/duties-tool/construction/hazards-information/high-risk-construction-work-requiring-swms',
      'https://www.g-mwater.com.au/downloads/20220309_procedure_working_safely_on_in_over_or_near_water.pdf',
    ],
  },
]
