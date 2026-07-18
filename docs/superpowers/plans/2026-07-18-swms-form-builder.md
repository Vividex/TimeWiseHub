# SWMS Form Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business author a SWMS (Safe Work Method Statement) from a structured form —
picking one of the 18 legislated High Risk Construction Work categories, editing a pre-filled
job-step/hazard/control table, and generating a real branded PDF — instead of only being able to
upload an existing file.

**Architecture:** Extends the existing `project_swms_documents` table (from the SWMS + Licence
Tracking phase) with `category`/`content`/`source` columns. A new server route renders a
React-PDF document from the form's structured content (`renderToBuffer`, same pattern as
`InvoiceDocument.tsx`/`invoices/[id]/pdf/route.ts`), uploads it to the existing `project-swms`
bucket, and inserts a row — `ProjectSwmsPanel.tsx`'s view/acknowledge/delete code needs zero
changes since it only ever reads `storage_path`. The 18 categories' starter content (job steps,
hazards, controls, PPE, licence info) ships as a static, sourced TypeScript module.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`),
`@react-pdf/renderer`, Tailwind v4.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- Migration file: `supabase/schema-106-swms-form-builder.sql`, applied via Supabase MCP
  `apply_migration` (name: `swms_form_builder`) — conductor-only, not a Codex text-edit task.
- Follow existing file conventions exactly: `'use client'` components use
  `@/lib/supabase-browser`; server pages use `@/lib/supabase-server`; server routes use
  `@/lib/supabase-server`.
- No new npm dependencies — `@react-pdf/renderer` is already installed and proven
  (`InvoiceDocument.tsx`, `PayslipDocument.tsx`).
- The 18-category template content in Task 2 is real, sourced content (Safe Work Australia and
  state WorkSafe/SafeWork guidance, cited inline) — transcribe it exactly as written in this plan,
  do not paraphrase or invent additional content.
- Source spec: `docs/superpowers/specs/2026-07-18-swms-form-builder-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-106-swms-form-builder.sql`

**Interfaces:**
- Produces: `project_swms_documents.category`, `.content`, `.source` columns;
  `certifications.licence_class` column; a corrected `employee-docs` storage upload policy.

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 106: SWMS Form Builder
-- Adds structured-authoring support to project_swms_documents (category,
-- content, source) and a licence_class field to certifications for the SWMS
-- licence cross-check. Also fixes a real pre-existing gap found during
-- research: the employee-docs upload storage policy only allowed
-- owner/admin, while certifications' own INSERT policy (schema-046) allows
-- owner/admin/manager — a manager could add a certification row but fail to
-- upload its document. Run via Supabase MCP apply_migration
-- (name: swms_form_builder)
-- ============================================================

alter table public.project_swms_documents
  add column category text,
  add column content jsonb,
  add column source text not null default 'uploaded';

alter table public.project_swms_documents
  add constraint project_swms_documents_source_check
  check (source in ('uploaded', 'authored'));

alter table public.certifications
  add column licence_class text;

drop policy "Managers can upload employee documents" on storage.objects;

create policy "Managers can upload employee documents"
  on storage.objects for insert
  with check (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.organisation_members om
      where om.org_id::text = (storage.foldername(name))[1]
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

drop policy "Managers can delete employee documents" on storage.objects;

create policy "Managers can delete employee documents"
  on storage.objects for delete
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`** (name: `swms_form_builder`)

- [ ] **Step 3: Verify**

Run via `mcp__supabase__execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'project_swms_documents' and column_name in ('category', 'content', 'source');

select column_name from information_schema.columns
where table_name = 'certifications' and column_name = 'licence_class';
```
Expected: `category` (text), `content` (jsonb), `source` (text) on `project_swms_documents`;
`licence_class` on `certifications`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-106-swms-form-builder.sql
git commit -m "handover: C-1 SWMS form builder migration (category/content/source, licence_class, employee-docs RLS fix)"
```

---

### Task 2: Types + the 18-category template library

**Files:**
- Modify: `src/types/swms.ts`
- Create: `src/lib/swms-templates.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HrcwCategory`, `HrwlClass`, `SwmsRow`, `SwmsAuthoredContent` (from `types/swms.ts`);
  `HRWL_CLASSES`, `HRCW_CATEGORY_LABELS`, `SwmsTemplate`, `SWMS_TEMPLATES` (from
  `lib/swms-templates.ts`) — later tasks import both.

- [ ] **Step 1: Extend `src/types/swms.ts`**

The file currently reads:
```typescript
export type SwmsAcknowledgment = {
  userId: string
  acknowledgedAt: string
}

export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  acknowledgments: SwmsAcknowledgment[]
}
```
Change to:
```typescript
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
```

- [ ] **Step 2: Create `src/lib/swms-templates.ts`**

```typescript
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
      { jobStep: 'Test the atmosphere and issue an entry permit', hazard: 'Oxygen deficiency or enrichment', control: 'Oxygen kept within 19.5%-23.5% by volume; air-supplied RPE provided if it can\'t be kept in range' },
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
    licenceNote: 'Not a High Risk Work Licence — requires a state-issued gasfitting licence (part of the plumbing/gasfitting scheme, not WHS-issued). Work on the distribution main itself additionally needs the specific network operator\'s authorisation. Not cross-checked against Certifications — confirm your crew holds the correct state licence.',
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
      { jobStep: 'Remove temporary bracing', hazard: "Bracing removed before the structure can carry its own load", control: 'Bracing only removed once the permanent connection is confirmed adequate by the engineer' },
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
      { jobStep: 'Plan plant movement', hazard: 'Struck-by or crush injury from moving plant', control: 'First control is separating workers from plant entirely; where that\'s not practicable, zone-based control is used (plant-only zones, plant-operating/restricted-personnel zones, plant-hazardous zones)' },
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
      { jobStep: 'Prepare for an emergency', hazard: 'Delayed rescue after a fall into water', control: 'A rescue plan developed and briefed to the team before work starts, wherever the risk assessment identifies it\'s needed' },
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
```

- [ ] **Step 3: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/swms.ts src/lib/swms-templates.ts && git commit -m "handover: C-2 SWMS types + 18-category template library"`

---

### Task 3: SwmsDocumentPdf component

**Files:**
- Create: `src/components/projects/SwmsDocumentPdf.tsx`

**Interfaces:**
- Consumes: `SwmsRow`, `HrcwCategory` (from `@/types/swms`), `HRCW_CATEGORY_LABELS` (from
  `@/lib/swms-templates`).
- Produces: a `SwmsDocumentPdf` React-PDF component, consumed by Task 5's API route via
  `renderToBuffer`.

- [ ] **Step 1: Create the component**

Follows the exact structural pattern of `src/components/invoices/InvoiceDocument.tsx` — a
`@react-pdf/renderer` `Document`/`Page`/`View`/`Text`/`StyleSheet` tree, no client-side logic.

```typescript
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { HrcwCategory, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'

type Props = {
  projectName: string
  category: HrcwCategory
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedNames: string[]
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a' },
  header: { backgroundColor: '#0f172a', padding: 20, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  subtitle: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 16, flexWrap: 'wrap' },
  metaBlock: { minWidth: 140 },
  label: { fontSize: 7, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 10, color: '#0f172a' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginTop: 16, marginBottom: 6 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 4 },
  colStep: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colHazard: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colControl: { flex: 3, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 5 },
  cellStep: { flex: 2, fontSize: 8 },
  cellHazard: { flex: 2, fontSize: 8 },
  cellControl: { flex: 3, fontSize: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, fontSize: 8 },
  consultedList: { fontSize: 9, color: '#374151' },
})

export default function SwmsDocumentPdf({
  projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Safe Work Method Statement</Text>
          <Text style={styles.subtitle}>{HRCW_CATEGORY_LABELS[category]}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Project</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Supervisor</Text>
            <Text style={styles.value}>{supervisor}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Prepared By</Text>
            <Text style={styles.value}>{preparedBy}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Job Steps, Hazards &amp; Controls</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colStep}>Job Step</Text>
          <Text style={styles.colHazard}>Hazard</Text>
          <Text style={styles.colControl}>Control Measure</Text>
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellStep}>{row.jobStep}</Text>
            <Text style={styles.cellHazard}>{row.hazard}</Text>
            <Text style={styles.cellControl}>{row.control}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>PPE Required</Text>
        <View style={styles.chipRow}>
          {ppe.map((item, i) => (
            <Text key={i} style={styles.chip}>{item}</Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Consultation</Text>
        <Text style={styles.consultedList}>
          {consultedNames.length > 0 ? `Consulted in developing this SWMS: ${consultedNames.join(', ')}` : 'No crew members recorded as consulted.'}
        </Text>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/projects/SwmsDocumentPdf.tsx && git commit -m "handover: C-3 SwmsDocumentPdf component"`

---

### Task 4: Certifications licence_class field

**Files:**
- Modify: `src/app/api/team/certifications/route.ts`
- Modify: `src/components/team/EmployeeDrawer.tsx`

**Interfaces:**
- Consumes: `HRWL_CLASSES` (from `@/lib/swms-templates`), `supportsSwms` (from the workspace
  profile, resolved by the page that renders `EmployeeDrawer` — see Step 3).

- [ ] **Step 1: Update the certifications API route**

The file currently reads (POST and PATCH handlers only — GET/DELETE untouched):
```typescript
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user_id, org_id, name, issued_date, expiry_date, document_path } = await req.json()
  const { data, error } = await supabase
    .from('certifications')
    .insert({ user_id, org_id, name, issued_date: issued_date || null, expiry_date: expiry_date || null, document_path: document_path || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```
Change to:
```typescript
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user_id, org_id, name, issued_date, expiry_date, document_path, licence_class } = await req.json()
  const { data, error } = await supabase
    .from('certifications')
    .insert({ user_id, org_id, name, issued_date: issued_date || null, expiry_date: expiry_date || null, document_path: document_path || null, licence_class: licence_class || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```
(`PATCH` already spreads `...updates` from the request body with no allowlist, so it accepts
`licence_class` unchanged — do not modify `PATCH`, `GET`, or `DELETE`.)

- [ ] **Step 2: Add `licence_class` to the `Cert` type and file state in `EmployeeDrawer.tsx`**

The `Cert` type currently reads (after the SWMS + Licence Tracking phase's document-upload change):
```typescript
type Cert = { id: string; name: string; issued_date: string | null; expiry_date: string | null; document_path: string | null }
```
Change to:
```typescript
type Cert = { id: string; name: string; issued_date: string | null; expiry_date: string | null; document_path: string | null; licence_class: string | null }
```

The imports currently read:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ScrollFade from '@/components/ui/ScrollFade'
```
Change to:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { HRWL_CLASSES } from '@/lib/swms-templates'
import ScrollFade from '@/components/ui/ScrollFade'
```

The `EmployeeDrawer` component's props signature currently reads:
```typescript
export default function EmployeeDrawer({ member, orgId, canManageTeam, canChangeRole, onClose }: {
  member: { user_id: string; display_name: string; role: string }; orgId: string
  canManageTeam: boolean; canChangeRole: boolean; onClose: () => void
}) {
```
Change to add a `showLicenceClass` prop (the caller resolves this from the workspace profile —
see Step 3):
```typescript
export default function EmployeeDrawer({ member, orgId, canManageTeam, canChangeRole, showLicenceClass, onClose }: {
  member: { user_id: string; display_name: string; role: string }; orgId: string
  canManageTeam: boolean; canChangeRole: boolean; showLicenceClass: boolean; onClose: () => void
}) {
```

The line `const [newCertFile, setNewCertFile] = useState<File | null>(null)` currently reads
exactly that. Add a sibling right after it:
```typescript
  const [newCertFile, setNewCertFile] = useState<File | null>(null)
  const [newCertLicenceClass, setNewCertLicenceClass] = useState('')
```

- [ ] **Step 3: Update `addCert` to include the licence class**

`addCert` currently reads:
```typescript
  async function addCert() {
    if (!newCertName) return
    setAddingCert(true)

    let documentPath: string | null = null
    if (newCertFile) {
      const supabase = createClient()
      const path = `${orgId}/${member.user_id}/${Date.now()}-${newCertFile.name}`
      const { error: uploadError } = await supabase.storage.from('employee-docs').upload(path, newCertFile)
      if (!uploadError) documentPath = path
    }

    const res = await fetch('/api/team/certifications', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, name: newCertName, expiry_date: newCertExpiry || null, document_path: documentPath }) })
    const newCert = await res.json()
    setCerts(prev => [...prev, newCert])
    setNewCertName(''); setNewCertExpiry(''); setNewCertFile(null); setAddingCert(false)
  }
```
Change to:
```typescript
  async function addCert() {
    if (!newCertName) return
    setAddingCert(true)

    let documentPath: string | null = null
    if (newCertFile) {
      const supabase = createClient()
      const path = `${orgId}/${member.user_id}/${Date.now()}-${newCertFile.name}`
      const { error: uploadError } = await supabase.storage.from('employee-docs').upload(path, newCertFile)
      if (!uploadError) documentPath = path
    }

    const res = await fetch('/api/team/certifications', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, name: newCertName, expiry_date: newCertExpiry || null, document_path: documentPath, licence_class: newCertLicenceClass || null }) })
    const newCert = await res.json()
    setCerts(prev => [...prev, newCert])
    setNewCertName(''); setNewCertExpiry(''); setNewCertFile(null); setNewCertLicenceClass(''); setAddingCert(false)
  }
```

- [ ] **Step 4: Add the licence-class dropdown to the add-certification form, gated to `showLicenceClass`**

The add-certification form currently reads:
```typescript
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3 space-y-2">
                <input value={newCertName} onChange={e => setNewCertName(e.target.value)} placeholder="Certification name"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="date" value={newCertExpiry} onChange={e => setNewCertExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="file" onChange={e => setNewCertFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-gray-500 dark:text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 dark:file:bg-slate-700 dark:file:text-slate-200" />
                <button onClick={addCert} disabled={addingCert || !newCertName}
                  className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2 text-sm font-semibold disabled:opacity-50">
                  {addingCert ? 'Adding…' : 'Add certification'}
                </button>
              </div>
```
Change to add the dropdown between the file input and the submit button, rendered only when
`showLicenceClass` is true:
```typescript
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3 space-y-2">
                <input value={newCertName} onChange={e => setNewCertName(e.target.value)} placeholder="Certification name"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="date" value={newCertExpiry} onChange={e => setNewCertExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="file" onChange={e => setNewCertFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-gray-500 dark:text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 dark:file:bg-slate-700 dark:file:text-slate-200" />
                {showLicenceClass && (
                  <select value={newCertLicenceClass} onChange={e => setNewCertLicenceClass(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                    <option value="">Not a High Risk Work Licence</option>
                    {HRWL_CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                  </select>
                )}
                <button onClick={addCert} disabled={addingCert || !newCertName}
                  className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2 text-sm font-semibold disabled:opacity-50">
                  {addingCert ? 'Adding…' : 'Add certification'}
                </button>
              </div>
```

- [ ] **Step 5: Thread `showLicenceClass` through `TeamGrid` from `/dashboard/team`**

`EmployeeDrawer` is rendered by `src/components/team/TeamGrid.tsx`, which is itself rendered by
`src/app/dashboard/team/page.tsx`. Neither currently resolves the workspace profile.

`src/app/dashboard/team/page.tsx`'s imports currently read:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import TeamGrid, { type TeamMember } from '@/components/team/TeamGrid'
import type { ExpiringCert } from '@/components/team/CertExpiryPanel'
import InviteMember from '@/components/InviteMember'
```
Change to:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import TeamGrid, { type TeamMember } from '@/components/team/TeamGrid'
import type { ExpiringCert } from '@/components/team/CertExpiryPanel'
import InviteMember from '@/components/InviteMember'
```

The line `const canManageTeam = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)`
currently reads exactly that. Add a sibling right after it:
```typescript
  const canManageTeam = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const { supportsSwms } = await getWorkspaceProfileForUser(supabase, user.id)
```

The `<TeamGrid ...>` render call currently reads:
```typescript
        <TeamGrid orgId={orgId} canManageTeam={canManageTeam} canChangeRole={membership?.role === 'owner'} viewerUserId={user.id} members={members} expiring={expiring} />
```
Change to:
```typescript
        <TeamGrid orgId={orgId} canManageTeam={canManageTeam} canChangeRole={membership?.role === 'owner'} showLicenceClass={supportsSwms} viewerUserId={user.id} members={members} expiring={expiring} />
```

`src/components/team/TeamGrid.tsx`'s props signature currently reads:
```typescript
export default function TeamGrid({ orgId, canManageTeam, canChangeRole, viewerUserId, members, expiring }: {
  orgId: string; canManageTeam: boolean; canChangeRole: boolean; viewerUserId: string
  members: TeamMember[]; expiring: ExpiringCert[]
}) {
```
Change to:
```typescript
export default function TeamGrid({ orgId, canManageTeam, canChangeRole, showLicenceClass, viewerUserId, members, expiring }: {
  orgId: string; canManageTeam: boolean; canChangeRole: boolean; showLicenceClass: boolean; viewerUserId: string
  members: TeamMember[]; expiring: ExpiringCert[]
}) {
```

The `<EmployeeDrawer ...>` render call currently reads:
```typescript
          <EmployeeDrawer member={selected} orgId={orgId} canManageTeam={canManageTeam} canChangeRole={canChangeRole && selected.user_id !== viewerUserId && selected.role !== 'owner'} onClose={() => setSelected(null)} />
```
Change to:
```typescript
          <EmployeeDrawer member={selected} orgId={orgId} canManageTeam={canManageTeam} canChangeRole={canChangeRole && selected.user_id !== viewerUserId && selected.role !== 'owner'} showLicenceClass={showLicenceClass} onClose={() => setSelected(null)} />
```

- [ ] **Step 6: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/api/team/certifications/route.ts src/components/team/EmployeeDrawer.tsx src/components/team/TeamGrid.tsx src/app/dashboard/team/page.tsx && git commit -m "handover: C-4 certifications licence_class field"`

---

### Task 5: SWMS build page, form, and API route (create flow)

**Files:**
- Create: `src/app/api/projects/[projectId]/swms/route.ts`
- Create: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`
- Create: `src/components/projects/SwmsBuilderForm.tsx`

**Interfaces:**
- Consumes: `SWMS_TEMPLATES`, `HRCW_CATEGORY_LABELS` (from `@/lib/swms-templates`);
  `HrcwCategory`, `SwmsRow`, `SwmsAuthoredContent` (from `@/types/swms`); `CrewMemberOption` (from
  `@/types/project-crew`); `SwmsDocumentPdf` (Task 3).
- Produces: `POST /api/projects/[projectId]/swms` — creates a new authored SWMS document.

- [ ] **Step 1: Create the API route**

```typescript
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import SwmsDocumentPdf from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as SwmsAuthoredContent & { consultedNames: string[]; projectName: string }
  const { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName } = body

  if (!category || !rows || rows.length === 0) {
    return NextResponse.json({ error: 'A category and at least one job step are required' }, { status: 400 })
  }

  const element = React.createElement(SwmsDocumentPdf, {
    projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = `${projectId}/${Date.now()}-swms-${category}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const content: SwmsAuthoredContent = { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `SWMS — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create the page**

```typescript
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SwmsBuilderForm from '@/components/projects/SwmsBuilderForm'
import type { CrewMemberOption } from '@/types/project-crew'

export default async function NewSwmsPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
  const { id, projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase.from('projects').select('id, name, org_id').eq('id', projectId).single()
  if (!project) notFound()

  const [{ data: crewRows }, { data: membership }] = await Promise.all([
    supabase.from('project_members').select('user_id').eq('project_id', projectId),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
  ])

  const orgId = membership?.org_id ?? project.org_id
  const crewUserIds = (crewRows ?? []).map(r => r.user_id as string)

  let crew: CrewMemberOption[] = []
  let crewCertLicenceClasses: { userId: string; licenceClass: string }[] = []

  if (orgId && crewUserIds.length > 0) {
    const [{ data: orgMembers }, { data: certs }] = await Promise.all([
      supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId).in('user_id', crewUserIds),
      supabase.from('certifications').select('user_id, licence_class').eq('org_id', orgId).not('licence_class', 'is', null),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crew = ((orgMembers ?? []) as any[]).map((m: any) => ({
      userId: m.user_id as string,
      displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string,
    }))
    crewCertLicenceClasses = (certs ?? []).map(c => ({ userId: c.user_id as string, licenceClass: c.licence_class as string }))
  }

  return (
    <SwmsBuilderForm
      clientId={id}
      projectId={projectId}
      projectName={project.name}
      crew={crew}
      crewCertLicenceClasses={crewCertLicenceClasses}
      currentUserDisplayName={user.email ?? 'You'}
    />
  )
}
```

- [ ] **Step 3: Create the form component**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { SWMS_TEMPLATES, HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import type { HrcwCategory, SwmsRow } from '@/types/swms'
import type { CrewMemberOption } from '@/types/project-crew'

export default function SwmsBuilderForm({
  clientId, projectId, projectName, crew, crewCertLicenceClasses, currentUserDisplayName,
}: {
  clientId: string
  projectId: string
  projectName: string
  crew: CrewMemberOption[]
  crewCertLicenceClasses: { userId: string; licenceClass: string }[]
  currentUserDisplayName: string
}) {
  const router = useRouter()
  const [category, setCategory] = useState<HrcwCategory | ''>('')
  const [supervisor, setSupervisor] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<SwmsRow[]>([])
  const [ppe, setPpe] = useState<string[]>([])
  const [consultedUserIds, setConsultedUserIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = useMemo(() => SWMS_TEMPLATES.find(t => t.category === category) ?? null, [category])

  function handleCategoryChange(next: HrcwCategory) {
    setCategory(next)
    const t = SWMS_TEMPLATES.find(x => x.category === next)
    setRows(t ? [...t.rows] : [])
    setPpe(t ? [...t.ppe] : [])
  }

  function updateRow(index: number, field: keyof SwmsRow, value: string) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function addRow() {
    setRows(prev => [...prev, { jobStep: '', hazard: '', control: '' }])
  }

  const heldClasses = new Set(crewCertLicenceClasses.map(c => c.licenceClass))
  const missingHrwl = template ? template.hrwlClasses.filter(cls => !heldClasses.has(cls)) : []

  async function handleSubmit() {
    if (!category || rows.length === 0) return
    setSaving(true)
    setError(null)
    const consultedNames = crew.filter(c => consultedUserIds.includes(c.userId)).map(c => c.displayName)
    const res = await fetch(`/api/projects/${projectId}/swms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe,
        consultedUserIds, consultedNames, projectName,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to save')
      return
    }
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}`)
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/clients/${clientId}/projects/${projectId}`} className="text-sm font-semibold text-cyan-600 hover:underline">← Back to project</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100">Build a SWMS</h1>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Pick a category to pre-fill a starting template — edit every row before saving. This is a
            starting point, not a legal sign-off; review the content carefully before relying on it.
          </p>

          <div className="mt-5 space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">High Risk Construction Work category</label>
            <select
              value={category}
              onChange={e => handleCategoryChange(e.target.value as HrcwCategory)}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="">Select a category…</option>
              {SWMS_TEMPLATES.map(t => (
                <option key={t.category} value={t.category}>{HRCW_CATEGORY_LABELS[t.category]}</option>
              ))}
            </select>
          </div>

          {template && (
            <>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Supervisor</label>
                  <input value={supervisor} onChange={e => setSupervisor(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Prepared by</label>
                  <input value={currentUserDisplayName} disabled className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>

              {template.licenceNote && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs font-medium text-gray-600 dark:text-slate-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{template.licenceNote}</span>
                </div>
              )}

              {missingHrwl.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>This category typically requires: {missingHrwl.join(', ')}. No crew member on this project has a matching certification on file.</span>
                </div>
              )}

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">Job steps, hazards &amp; controls</h2>
              <div className="mt-2 space-y-3">
                {rows.map((row, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-800 p-3 space-y-2">
                    <input value={row.jobStep} onChange={e => updateRow(i, 'jobStep', e.target.value)} placeholder="Job step" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                    <input value={row.hazard} onChange={e => updateRow(i, 'hazard', e.target.value)} placeholder="Hazard" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                    <input value={row.control} onChange={e => updateRow(i, 'control', e.target.value)} placeholder="Control measure" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                    <button onClick={() => removeRow(i)} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove row</button>
                  </div>
                ))}
                <button onClick={addRow} className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">+ Add row</button>
              </div>

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">PPE required</h2>
              <div className="mt-2 space-y-2">
                {ppe.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={item} onChange={e => setPpe(prev => prev.map((p, idx) => (idx === i ? e.target.value : p)))} className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                    <button onClick={() => setPpe(prev => prev.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <button onClick={() => setPpe(prev => [...prev, ''])} className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">+ Add PPE item</button>
              </div>

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">Consultation</h2>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-slate-400">Who was consulted in developing this SWMS?</p>
              <div className="mt-2 space-y-1">
                {crew.map(member => (
                  <label key={member.userId} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={consultedUserIds.includes(member.userId)}
                      onChange={e => setConsultedUserIds(prev => e.target.checked ? [...prev, member.userId] : prev.filter(id => id !== member.userId))}
                    />
                    {member.displayName}
                  </label>
                ))}
                {crew.length === 0 && <p className="text-xs font-medium text-gray-400">No crew assigned to this project yet.</p>}
              </div>

              {error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={saving || rows.length === 0}
                className="mt-6 w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Generating…' : 'Generate SWMS'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/api/projects/[projectId]/swms/route.ts "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx" src/components/projects/SwmsBuilderForm.tsx && git commit -m "handover: C-5 SWMS build page, form, and create API route"`

---

### Task 6: Wire the "+ Build SWMS" entry point into ProjectSwmsPanel

**Files:**
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `HRCW_CATEGORY_LABELS` (from `@/lib/swms-templates`); the extended `SwmsDocument` type
  (Task 2) now carrying `category`/`source`.

- [ ] **Step 1: Update the project detail page's SWMS fetch**

The SWMS document fetch currently reads:
```typescript
    const { data: swmsRows } = await supabase
      .from('project_swms_documents')
      .select('id, name, storage_path')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
```
Change to:
```typescript
    const { data: swmsRows } = await supabase
      .from('project_swms_documents')
      .select('id, name, storage_path, category, source')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
```

The `swmsDocuments` mapping currently reads:
```typescript
    swmsDocuments = (swmsRows ?? []).map(doc => ({
      id: doc.id,
      name: doc.name,
      storagePath: doc.storage_path,
      acknowledgments: (ackRows ?? [])
        .filter(a => a.swms_document_id === doc.id)
        .map(a => ({ userId: a.user_id, acknowledgedAt: a.acknowledged_at })),
    }))
```
Change to:
```typescript
    swmsDocuments = (swmsRows ?? []).map(doc => ({
      id: doc.id,
      name: doc.name,
      storagePath: doc.storage_path,
      category: doc.category as SwmsDocument['category'],
      source: doc.source as SwmsDocument['source'],
      acknowledgments: (ackRows ?? [])
        .filter(a => a.swms_document_id === doc.id)
        .map(a => ({ userId: a.user_id, acknowledgedAt: a.acknowledged_at })),
    }))
```

The type-only import line currently reads:
```typescript
import type { SwmsDocument } from '@/types/swms'
```
Leave unchanged — `SwmsDocument` is already imported, just now carries the two new fields (Task 2
already extended the type).

- [ ] **Step 2: Add the "+ Build SWMS" button and per-document Edit/category label**

The panel's header currently reads:
```typescript
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety (SWMS)
        </h2>
        {canManage && (
          <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading ? 'Uploading…' : '+ Upload SWMS'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
```
Change to add a "+ Build SWMS" link next to the existing upload button (needs the imports and
`projectId`/`clientId` already available as props — `ProjectSwmsPanel` already receives
`projectId`; add a new `clientId` prop since the build page's URL needs it):

First, the component's props signature currently reads:
```typescript
export default function ProjectSwmsPanel({
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
}: {
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
}) {
```
Change to:
```typescript
export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
}) {
```

The imports currently read:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { SwmsDocument } from '@/types/swms'
```
Change to:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import type { SwmsDocument } from '@/types/swms'
```

Now the header block. Change to:
```typescript
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety (SWMS)
        </h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new`}
              className="rounded-xl border border-cyan-600 px-4 py-2 text-sm font-semibold text-cyan-600 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
            >
              + Build SWMS
            </Link>
            <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '+ Upload SWMS'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Show the category label for authored documents**

The document name/acknowledgment-count block currently reads:
```typescript
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.name}</p>
                    {canManage && (
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.acknowledgments.length} of {crewSize} crew acknowledged
                      </p>
                    )}
                  </div>
```
Change to:
```typescript
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.name}</p>
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">{HRCW_CATEGORY_LABELS[doc.category]}</p>
                    )}
                    {canManage && (
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.acknowledgments.length} of {crewSize} crew acknowledged
                      </p>
                    )}
                  </div>
```

- [ ] **Step 4: Pass `clientId` from the project detail page**

The `<ProjectCrewPanel>`/`<ProjectSwmsPanel>` render block currently reads:
```typescript
        {supportsSwms && (
          <>
            <ProjectCrewPanel
              projectId={project.id}
              crew={crew}
              availableMembers={availableMembers}
              canManage={canManageConfidential}
            />
            <ProjectSwmsPanel
              projectId={project.id}
              documents={swmsDocuments}
              crewSize={crew.length}
              currentUserId={user.id}
              isCrewMember={isCrewMember}
              canManage={canManageConfidential}
            />
          </>
        )}
```
Change to:
```typescript
        {supportsSwms && (
          <>
            <ProjectCrewPanel
              projectId={project.id}
              crew={crew}
              availableMembers={availableMembers}
              canManage={canManageConfidential}
            />
            <ProjectSwmsPanel
              clientId={id}
              projectId={project.id}
              documents={swmsDocuments}
              crewSize={crew.length}
              currentUserId={user.id}
              isCrewMember={isCrewMember}
              canManage={canManageConfidential}
            />
          </>
        )}
```
(`id` is the page's existing `params.id`, already in scope from the top of the function.)

- [ ] **Step 5: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: as a trades/construction-profile org, click "+ Build SWMS" on a project, confirm the
  category picker pre-fills the table, confirm the licence warning appears/doesn't appear
  correctly, confirm the generated PDF opens via "View" and matches what was entered, confirm the
  category label shows on the authored document's row.
- [ ] Commit: `git add src/components/projects/ProjectSwmsPanel.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" && git commit -m "handover: C-6 wire Build SWMS entry point into ProjectSwmsPanel"`

---

### Task 7: Edit-before-acknowledgment / supersede-after-acknowledgment

**Files:**
- Modify: `src/app/api/projects/[projectId]/swms/route.ts`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`
- Modify: `src/components/projects/SwmsBuilderForm.tsx`
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`

**Interfaces:**
- Consumes: Task 5/6's form, page, and panel.
- Produces: `documentId` query-param support on the build page, in-place-edit-or-supersede logic
  in the API route.

- [ ] **Step 1: Extend the API route to handle editing**

The route's handler signature and insert logic from Task 5 currently POSTs a brand-new row every
time. Add a `documentId` field to the request body; if present, check whether that document has
any acknowledgments — if zero, update the existing row (and overwrite the existing storage object
at its same path); if one or more, ignore `documentId` and insert a new row exactly as Task 5 did
(the old row is left untouched).

The route's body destructure currently reads:
```typescript
  const body = await req.json() as SwmsAuthoredContent & { consultedNames: string[]; projectName: string }
  const { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName } = body
```
Change to:
```typescript
  const body = await req.json() as SwmsAuthoredContent & { consultedNames: string[]; projectName: string; documentId?: string }
  const { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId } = body
```

The block from PDF rendering through the insert currently reads:
```typescript
  const element = React.createElement(SwmsDocumentPdf, {
    projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = `${projectId}/${Date.now()}-swms-${category}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const content: SwmsAuthoredContent = { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `SWMS — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
```
Change to:
```typescript
  const content: SwmsAuthoredContent = { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  let editableExistingPath: string | null = null
  if (documentId) {
    const [{ data: existing }, { count: ackCount }] = await Promise.all([
      supabase.from('project_swms_documents').select('id, storage_path, source').eq('id', documentId).eq('project_id', projectId).single(),
      supabase.from('project_swms_acknowledgments').select('id', { count: 'exact', head: true }).eq('swms_document_id', documentId),
    ])
    if (existing && existing.source === 'authored' && (ackCount ?? 0) === 0) {
      editableExistingPath = existing.storage_path
    }
  }

  const element = React.createElement(SwmsDocumentPdf, {
    projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = editableExistingPath ?? `${projectId}/${Date.now()}-swms-${category}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf', upsert: !!editableExistingPath })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  if (editableExistingPath) {
    const { data, error } = await supabase
      .from('project_swms_documents')
      .update({ name: `SWMS — ${category}`, category, content })
      .eq('id', documentId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `SWMS — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
```

- [ ] **Step 2: Extend the page to pre-fill from an existing document**

The page's function signature currently reads:
```typescript
export default async function NewSwmsPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
```
Change to accept and use a `documentId` search param:
```typescript
export default async function NewSwmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; projectId: string }>
  searchParams: Promise<{ documentId?: string }>
}) {
  const { documentId } = await searchParams
```
(Insert that destructure right after the existing `const { id, projectId } = await params` line.)

After the existing crew/certifications fetch block (right before the `return`), add:
```typescript
  let existingContent = null
  if (documentId) {
    const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
    existingContent = doc?.content ?? null
  }
```

The final `<SwmsBuilderForm ...>` call currently reads:
```typescript
  return (
    <SwmsBuilderForm
      clientId={id}
      projectId={projectId}
      projectName={project.name}
      crew={crew}
      crewCertLicenceClasses={crewCertLicenceClasses}
      currentUserDisplayName={user.email ?? 'You'}
    />
  )
```
Change to:
```typescript
  return (
    <SwmsBuilderForm
      clientId={id}
      projectId={projectId}
      projectName={project.name}
      crew={crew}
      crewCertLicenceClasses={crewCertLicenceClasses}
      currentUserDisplayName={user.email ?? 'You'}
      documentId={documentId ?? null}
      existingContent={existingContent}
    />
  )
```

- [ ] **Step 3: Extend the form component to pre-fill and pass `documentId` through**

The component's props signature currently reads:
```typescript
export default function SwmsBuilderForm({
  clientId, projectId, projectName, crew, crewCertLicenceClasses, currentUserDisplayName,
}: {
  clientId: string
  projectId: string
  projectName: string
  crew: CrewMemberOption[]
  crewCertLicenceClasses: { userId: string; licenceClass: string }[]
  currentUserDisplayName: string
}) {
```
Change to:
```typescript
export default function SwmsBuilderForm({
  clientId, projectId, projectName, crew, crewCertLicenceClasses, currentUserDisplayName, documentId, existingContent,
}: {
  clientId: string
  projectId: string
  projectName: string
  crew: CrewMemberOption[]
  crewCertLicenceClasses: { userId: string; licenceClass: string }[]
  currentUserDisplayName: string
  documentId: string | null
  existingContent: SwmsAuthoredContent | null
}) {
```

Add `SwmsAuthoredContent` to the type-only import. The import line currently reads:
```typescript
import type { HrcwCategory, SwmsRow } from '@/types/swms'
```
Change to:
```typescript
import type { HrcwCategory, SwmsRow, SwmsAuthoredContent } from '@/types/swms'
```

The state initialization currently reads:
```typescript
  const [category, setCategory] = useState<HrcwCategory | ''>('')
  const [supervisor, setSupervisor] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<SwmsRow[]>([])
  const [ppe, setPpe] = useState<string[]>([])
  const [consultedUserIds, setConsultedUserIds] = useState<string[]>([])
```
Change to pre-fill from `existingContent` when present:
```typescript
  const [category, setCategory] = useState<HrcwCategory | ''>(existingContent?.category ?? '')
  const [supervisor, setSupervisor] = useState(existingContent?.supervisor ?? '')
  const [date, setDate] = useState(existingContent?.date ?? new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<SwmsRow[]>(existingContent?.rows ?? [])
  const [ppe, setPpe] = useState<string[]>(existingContent?.ppe ?? [])
  const [consultedUserIds, setConsultedUserIds] = useState<string[]>(existingContent?.consultedUserIds ?? [])
```

The `handleSubmit` function's fetch body currently reads:
```typescript
    const res = await fetch(`/api/projects/${projectId}/swms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe,
        consultedUserIds, consultedNames, projectName,
      }),
    })
```
Change to:
```typescript
    const res = await fetch(`/api/projects/${projectId}/swms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe,
        consultedUserIds, consultedNames, projectName, documentId,
      }),
    })
```

- [ ] **Step 4: Add an "Edit" entry point for authored documents in `ProjectSwmsPanel`**

The document row's action buttons currently read (after Task 6's changes):
```typescript
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => handleView(doc.storagePath)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
                    {isCrewMember && !hasAcknowledged && (
```
Change to add an Edit link right after the View button, shown only for authored documents and
only to managers:
```typescript
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => handleView(doc.storagePath)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
                    {canManage && doc.source === 'authored' && (
                      <Link href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?documentId=${doc.id}`} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">Edit</Link>
                    )}
                    {isCrewMember && !hasAcknowledged && (
```

- [ ] **Step 5: Report back — list files changed.**

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: build a SWMS, edit it before anyone acknowledges (confirm it updates the same
  document, not a duplicate), have a crew member acknowledge it, edit again (confirm this time it
  creates a new document and the old one remains with its original acknowledgment intact).
- [ ] Commit: `git add src/app/api/projects/[projectId]/swms/route.ts "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx" src/components/projects/SwmsBuilderForm.tsx src/components/projects/ProjectSwmsPanel.tsx && git commit -m "handover: C-7 edit-before-ack / supersede-after-ack SWMS lifecycle"`

---

## Acceptance checklist

- [ ] C-1: migration applies cleanly (new columns + corrected employee-docs RLS).
- [ ] C-2: types and the 18-category template library compile.
- [ ] C-3: `SwmsDocumentPdf` compiles in isolation.
- [ ] C-4: licence-class dropdown appears only for `supportsSwms` orgs; certifications API accepts
  and stores it.
- [ ] C-5: "+ Build SWMS" generates a real PDF from the form, saved alongside uploaded documents.
- [ ] C-6: category label and Build entry point appear correctly in `ProjectSwmsPanel`.
- [ ] C-7: edit-before-ack updates in place; edit-after-ack creates a new document, old one
  preserved with its acknowledgments intact.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test per each task's Manual step above — requires the user's own authenticated
  session as a trades/construction-profile org member. **User follow-up, not the conductor's to
  complete.**

## Verification

No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every turn,
full clean build after C-7, plus each task's own Manual step above.
