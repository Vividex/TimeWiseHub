# JSA Document Type + Reusable Signatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Job Safety Analysis (JSA) document type — the everyday-hazard counterpart to the
existing legislated SWMS builder — sharing its infrastructure, plus a reusable per-user digital
signature rendered into both document types on demand.

**Architecture:** Extends `project_swms_documents` with a `doc_type` discriminator column (same
document table, storage bucket, RLS, and acknowledgment lifecycle as SWMS — no parallel system).
`SwmsAuthoredContent` becomes a discriminated union on `docType`. An 11-template JSA hazard
library ships as a static, sourced TypeScript module, same pattern as the existing 18-category
SWMS library. A new `profiles.signature_path` + private `signatures` bucket holds one reusable,
redrawable signature per user (hand-rolled canvas capture, no new dependency). Authored-document
PDFs move from "rendered once at creation" to "also live-rendered on demand" so a downloaded/
viewed copy always reflects current acknowledgment signatures.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`),
`@react-pdf/renderer`, Tailwind v4.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- Two migrations: `supabase/schema-108-jsa-doc-type.sql` (name: `jsa_doc_type`) and
  `supabase/schema-109-signatures.sql` (name: `jsa_signatures`), each applied via Supabase MCP
  `apply_migration` — conductor-only, not a Codex text-edit task.
- Follow existing file conventions exactly: `'use client'` components use
  `@/lib/supabase-browser`; server pages/routes use `@/lib/supabase-server`; server-side
  cross-user reads use `@/lib/supabase-service`'s `createServiceClient()`.
- No new npm dependencies — `@react-pdf/renderer` is already installed; signature capture is a
  hand-rolled `<canvas>` component, same pattern already proven by `WhiteboardCanvas.tsx`
  (freehand capture) and `LogoUpload.tsx` (canvas-to-blob export).
- The 11 JSA templates in Task 3 are real, sourced content (SafeWork Australia and state
  WorkSafe/SafeWork guidance, cited inline per template) — transcribe exactly as written in this
  plan, do not paraphrase or invent additional content.
- Source spec: `docs/superpowers/specs/2026-07-18-jsa-form-builder-design.md`.
- Part A (Tasks 1-8) ships JSA end-to-end and is independently shippable. Part B (Tasks 9-14)
  adds signatures on top and can ship as a separate follow-up session.

---

## Part A — JSA document type

### Task 1: Database migration — `doc_type` column

**Files:**
- Create: `supabase/schema-108-jsa-doc-type.sql`

**Interfaces:**
- Produces: `project_swms_documents.doc_type` column (`'swms' | 'jsa'`, default `'swms'`).

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 108: JSA document type
-- Adds doc_type to project_swms_documents so the same document list,
-- storage bucket, RLS, and crew-acknowledgment lifecycle can host both SWMS
-- (legislated HRCW work) and JSA (everyday small-scale task) documents.
-- Run via Supabase MCP apply_migration (name: jsa_doc_type)
-- ============================================================

alter table public.project_swms_documents
  add column doc_type text not null default 'swms';

alter table public.project_swms_documents
  add constraint project_swms_documents_doc_type_check
  check (doc_type in ('swms', 'jsa'));
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`** (name: `jsa_doc_type`)

- [ ] **Step 3: Verify**

Run via `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'project_swms_documents' and column_name = 'doc_type';
```
Expected: one row, `doc_type`, `text`, default `'swms'::text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-108-jsa-doc-type.sql
git commit -m "handover: A-1 JSA doc_type migration"
```

---

### Task 2: Types — discriminated union + JsaHazard

**Files:**
- Modify: `src/types/swms.ts`

**Interfaces:**
- Produces: `JsaHazard`, discriminated `SwmsAuthoredContent` (union on `docType`), `SwmsDocument`
  gains `docType: 'swms' | 'jsa'` and its `category` field widens to accept either category type.

- [ ] **Step 1: Replace the full contents of `src/types/swms.ts`**

Current file:
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

Replace with:
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

export type JsaHazard =
  | 'ladder_step'
  | 'hand_power_tools'
  | 'hazardous_substances'
  | 'manual_handling'
  | 'slips_trips_falls'
  | 'working_alone'
  | 'hot_work'
  | 'portable_electrical'
  | 'noise_exposure'
  | 'weather_exposure'
  | 'biological_hazards'

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

type SwmsAuthoredContentBase = {
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
}

export type SwmsAuthoredContent =
  | (SwmsAuthoredContentBase & { docType: 'swms'; category: HrcwCategory })
  | (SwmsAuthoredContentBase & {
      docType: 'jsa'
      category: JsaHazard
      whoAtRisk: string
      equipment: string
      emergencyProcedures: string
    })

export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  category: HrcwCategory | JsaHazard | null
  docType: 'swms' | 'jsa'
  source: 'uploaded' | 'authored'
  acknowledgments: SwmsAcknowledgment[]
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: fails — `SwmsBuilderForm.tsx`, `SwmsDocumentPdf.tsx`, `ProjectSwmsPanel.tsx`, the
project detail page, and the API route all construct/consume `SwmsAuthoredContent`/`SwmsDocument`
using the old shape. This is expected; later tasks in this plan fix each one. Confirm the errors
are all in those five files and nowhere else.

- [ ] **Step 3: Commit**

```bash
git add src/types/swms.ts
git commit -m "handover: A-2 JSA types (discriminated SwmsAuthoredContent, JsaHazard)"
```

---

### Task 3: JSA hazard template library

**Files:**
- Create: `src/lib/jsa-templates.ts`

**Interfaces:**
- Consumes: `JsaHazard`, `SwmsRow` from `@/types/swms` (Task 2).
- Produces: `JSA_HAZARD_LABELS`, `JsaTemplate`, `JSA_TEMPLATES` — consumed by Task 4
  (`SwmsBuilderForm.tsx`) and Task 8 (`ProjectSwmsPanel.tsx`).

This content is real, sourced content researched specifically for this plan (SafeWork Australia,
SafeWork NSW/SA, WorkSafe WA/Vic/ACT — cited per template) — transcribe exactly, do not paraphrase.

- [ ] **Step 1: Create `src/lib/jsa-templates.ts`**

```typescript
import type { JsaHazard, SwmsRow } from '@/types/swms'

export const JSA_HAZARD_LABELS: Record<JsaHazard, string> = {
  ladder_step: 'Working from a ladder or step (below 2m)',
  hand_power_tools: 'Hand and power tool use',
  hazardous_substances: 'Hazardous substances, chemicals and dust/silica',
  manual_handling: 'Manual handling (lifting and carrying)',
  slips_trips_falls: 'Slips, trips and falls on the same level',
  working_alone: 'Working alone or in an isolated location',
  hot_work: 'Hot work (grinding, cutting, welding)',
  portable_electrical: 'Portable electrical equipment and leads',
  noise_exposure: 'Noise exposure from tools and equipment',
  weather_exposure: 'Weather and environmental exposure (UV, heat, cold)',
  biological_hazards: 'Biological hazards (sewage, mould, vermin)',
}

export type JsaTemplate = {
  hazard: JsaHazard
  rows: SwmsRow[]
  ppe: string[]
  sources: string[]
}

export const JSA_TEMPLATES: JsaTemplate[] = [
  {
    hazard: 'ladder_step',
    rows: [
      { jobStep: 'Decide whether a ladder is the right tool for the job', hazard: 'Fall from height from using a ladder when a safer method is available', control: 'Use a ladder only for simple access tasks or short-duration work; where practicable use a safer alternative such as scaffolding or an elevated work platform instead' },
      { jobStep: 'Select and inspect the ladder before use', hazard: 'Ladder failure or collapse from using damaged equipment or the wrong ladder for the job', control: 'Choose a ladder that meets Australian Standards and suits the load/height of the job; inspect it for damage before each use and take any damaged ladder out of service immediately' },
      { jobStep: 'Set up the ladder', hazard: 'Ladder slipping or toppling on an unstable or uneven surface', control: 'Set the ladder up on a flat, stable surface; where this isn’t possible, use a ladder fitted with levelling feet, stabilisers, or anti-slip gutter guards' },
      { jobStep: 'Position and secure an extension ladder', hazard: 'Ladder base sliding out or the ladder toppling backward', control: 'Angle extension ladders at a 1:4 ratio (base positioned 1m out for every 4m of height) and secure the ladder at the top and/or bottom, or have a second person foot it while in use' },
      { jobStep: 'Climb, descend, and work from the ladder', hazard: 'Fall from loss of balance or overreaching', control: 'Maintain three points of contact at all times (two hands and one foot, or two feet and one hand); never lean or reach away from the ladder — reposition it instead; don’t climb or work past the second-last rung, and never straddle the top of an A-frame' },
      { jobStep: 'Carry tools or materials up/down the ladder', hazard: 'Fall or dropped-object injury from carrying loads while climbing', control: 'Only take small items up or down; never carry large or heavy items such as building materials, and ensure the combined weight of the person plus tools/materials never exceeds the ladder’s working load limit' },
      { jobStep: 'Finish the task and put the ladder away', hazard: 'Fall while stepping off, or the ladder becoming a trip/struck-by hazard for others', control: 'When descending, remain facing the ladder and climb to the bottom rung before stepping off; lock A-frame ladders in the fully open position whenever in use, and store away from foot traffic when not in use' },
    ],
    ppe: ['Non-slip safety footwear', 'Hard hat (where there’s a risk of falling objects or overhead hazards)', 'Gloves suited to the task (removed if they reduce climbing grip)', 'Hi-vis clothing (where relevant to site traffic)'],
    sources: [
      'https://www.safework.nsw.gov.au/hazards-a-z/ladders',
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risk-falls-workplaces',
      'https://www.worksafe.act.gov.au/health-and-safety-portal/safety-topics/safety-advice/stop-construction-falls/best-practice-ladder-usage',
    ],
  },
  {
    hazard: 'hand_power_tools',
    rows: [
      { jobStep: 'Select and inspect the tool before use', hazard: 'Tool failure, electric shock, or entanglement from a damaged tool or cord', control: 'Carry out a pre-start check to confirm the tool is in good working order, guards are fitted and functioning, and the cord/plug is undamaged; take damaged tools out of service' },
      { jobStep: 'Connect power tools to the electricity supply', hazard: 'Electric shock from faulty equipment or wiring', control: 'Only use power tools through a tested and tagged residual current device (RCD); on construction/demolition work, portable RCDs must be tested every 3 months (per AS/NZS 3012) and given a push-button operational test before each day’s use' },
      { jobStep: 'Fit the correct guard, disc, or blade', hazard: 'Disc/blade shattering or contacting the operator, causing lacerations', control: 'Fit the guard supplied by the manufacturer and never remove it; use the correct disc/blade type and size matched to the tool’s rated speed and the job' },
      { jobStep: 'Start the tool and apply it to the work', hazard: 'Kickback or grab when the tool contacts the workpiece', control: 'Let the tool reach full operating speed before applying it to the job; apply minimum pressure, hold it at the recommended angle, and never bump the tool onto the workpiece' },
      { jobStep: 'Operate the tool', hazard: 'Entanglement or cuts from contact with moving parts', control: 'Keep hands and feet clear of moving parts, use both hands (including the side handle where fitted), and keep bystanders a safe distance away while the tool is running' },
      { jobStep: 'Use tools that require specific training (e.g. angle grinders)', hazard: 'Injury from untrained or unauthorised use', control: 'Only operate a tool if trained and authorised to do so by the employer, and follow the employer’s safe operating procedure; new or young workers must get correct training and supervision' },
      { jobStep: 'Finish and store the tool', hazard: 'Injury to others from an unattended running or plugged-in tool', control: 'Switch off and unplug/isolate the tool before leaving it unattended, and store it so the guard and blade/disc are protected and the cord isn’t damaged' },
    ],
    ppe: ['Safety glasses or face shield', 'Hearing protection', 'Task-appropriate gloves (removed where they risk entanglement in rotating parts)', 'Dust mask/RPE when cutting or sanding generates dust'],
    sources: [
      'https://www.safework.nsw.gov.au/resource-library/blogs/blogs-accordions/use-power-tools-safely',
      'https://www.safework.sa.gov.au/workplaces/plant-tools-and-vehicles/angle-grinders',
      'https://www.safework.nsw.gov.au/hazards-a-z/electrical-and-power/residual-current-devices',
    ],
  },
  {
    hazard: 'hazardous_substances',
    rows: [
      { jobStep: 'Identify hazardous chemicals and dust-generating tasks before starting', hazard: 'Exposure to hazardous chemicals or airborne respirable crystalline silica without adequate controls', control: 'Check the Safety Data Sheet (SDS) for each chemical product and identify any tasks — cutting, drilling, or sanding masonry, tiles, or concrete — that generate silica dust; keep an up-to-date hazardous chemicals register' },
      { jobStep: 'Substitute or eliminate where reasonably practicable', hazard: 'Ongoing exposure from higher-hazard products or dry-cutting methods', control: 'Substitute lower-hazard chemical products where possible, and choose wet-cutting or on-tool dust-extraction methods over dry cutting of silica-containing materials' },
      { jobStep: 'Control dust at the source when cutting, drilling, or sanding', hazard: 'Inhalation of respirable crystalline silica dust', control: 'Use water suppression (wet cutting) or on-tool local exhaust ventilation; dry-cutting silica-containing materials without these controls generates dust levels far exceeding the workplace exposure standard' },
      { jobStep: 'Store and handle chemical products', hazard: 'Skin/eye contact, spills, or dangerous reaction between incompatible chemicals', control: 'Store chemicals in their original, correctly labelled containers, segregate incompatible substances, and follow the SDS storage and handling instructions' },
      { jobStep: 'Apply RPE as a residual control', hazard: 'Remaining exposure to dust or vapours after other controls are applied', control: 'Where primary controls (substitution, wet-cutting, extraction) can’t fully eliminate exposure, use RPE that complies with Australian Standards and properly seals to the face — as an addition to, not a replacement for, those higher-order controls' },
      { jobStep: 'Ventilate the work area and clean up', hazard: 'Dust or vapour build-up in enclosed spaces, or re-suspension of settled dust', control: 'Work in a well-ventilated area and clean up dust using a HEPA-filtered vacuum or damp methods; never dry sweep or use compressed air to clear dust' },
      { jobStep: 'Dispose of chemical waste and contaminated material', hazard: 'Environmental contamination or exposure to others handling waste', control: 'Dispose of containers, offcuts, and dust waste according to the SDS and local regulatory requirements; never pour chemicals down drains' },
    ],
    ppe: ['Chemical-resistant gloves suited to the product (check the SDS)', 'Safety glasses/goggles', 'RPE (fit-tested P2 respirator or higher) for dust/silica tasks', 'Coveralls or apron where splash contact is possible'],
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risks-hazardous-chemicals-workplace',
      'https://www.safeworkaustralia.gov.au/sites/default/files/2022-06/national_guide_for_working_with_silica_and_silica_containing_products_3_0_0.pdf',
      'https://www.safework.nsw.gov.au/hazards-a-z/hazardous-chemical/priority-chemicals/crystalline-silica/work-safely-with-crystalline-silica-and-engineered-stone',
    ],
  },
  {
    hazard: 'manual_handling',
    rows: [
      { jobStep: 'Plan the task before starting', hazard: 'Musculoskeletal disorder (MSD) from an unplanned hazardous manual task', control: 'Identify hazardous manual task risk factors in advance (awkward postures, high force, repetition, long duration) and plan the safest way to carry out the job before starting' },
      { jobStep: 'Eliminate or reduce the need to manually handle loads', hazard: 'MSD from lifting or carrying heavy or awkward loads', control: 'Where reasonably practicable, eliminate the manual task or use mechanical aids (trolleys, hoists, forklifts) to reduce manual handling' },
      { jobStep: 'Assess the load before lifting', hazard: 'Strain injury from misjudging a load’s weight, size, or stability', control: 'Check the load’s weight, size, and stability before lifting, and break loads down into smaller, lighter units where possible' },
      { jobStep: 'Lift and carry the load', hazard: 'Back or musculoskeletal injury from poor lifting technique', control: 'Keep the load close to the body, avoid twisting the back while lifting, and get help or use a team lift for heavy or awkward loads' },
      { jobStep: 'Position the task to avoid awkward posture', hazard: 'MSD from sustained or repetitive awkward postures (bending, reaching, working below knee or above shoulder height)', control: 'Adjust the height or position of the work — using a bench, trolley, or platform — to keep tasks within a comfortable working zone' },
      { jobStep: 'Manage repetitive or prolonged manual tasks', hazard: 'MSD from repetition, sustained force, or duration', control: 'Rotate tasks between workers or take regular breaks to vary posture and reduce sustained load on the same muscle groups' },
      { jobStep: 'Consult workers on manual task risks', hazard: 'Unidentified or unmanaged MSD risk factors', control: 'Consult with the workers doing the task, since they’re often best placed to identify risk factors and practical controls' },
    ],
    ppe: ['Gloves suited to the load (grip and cut/abrasion protection)', 'Safety footwear with protective toe cap', 'Hi-vis clothing (where relevant to the site)', 'Protective sleeves/clothing where load surfaces are rough or sharp'],
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/model-code-practice-hazardous-manual-tasks',
      'https://www.safeworkaustralia.gov.au/safety-topic/hazards/lifting-pushing-and-pulling-manual-tasks',
    ],
  },
  {
    hazard: 'slips_trips_falls',
    rows: [
      { jobStep: 'Arrive at site and walk through the work area', hazard: 'Trip on uneven surfaces, cords, tools or debris underfoot', control: 'Conduct a visual walk-through before starting work; identify and remove or clearly mark trip hazards such as loose cords, tools, offcuts and uneven ground' },
      { jobStep: 'Set up tools, leads and equipment for the task', hazard: 'Trip over electrical cords/leads or hoses run across walkways', control: 'Route leads and hoses away from walkways and doorways, or elevate/cover them; use lead stands or a sufficient number of power outlets to keep cords off the floor' },
      { jobStep: 'Work in wet, oily or dusty conditions', hazard: 'Slip on wet floors, spills or contaminated surfaces', control: 'Clean up spills immediately, use wet floor signs/barricades, and use slip-resistant flooring or floor treatments where the hazard is ongoing' },
      { jobStep: 'Move materials and tools around the site', hazard: 'Trip on clutter, stored materials or poor housekeeping', control: 'Keep walkways, aisles and access routes clear of stock, offcuts and rubbish; maintain adequate storage so materials are not left underfoot' },
      { jobStep: 'Work in low-light areas (early morning, evening, indoors)', hazard: 'Slip or trip due to poor visibility of hazards', control: 'Ensure adequate lighting in work areas, passageways and at floor-level transitions before starting work' },
      { jobStep: 'Use stairs, ramps or steps on site', hazard: 'Fall on stairs due to inconsistent step height, missing handrails or loose mats', control: 'Use handrails, ensure step edges are clearly marked and consistent, and secure or remove loose rugs and mats' },
      { jobStep: 'Select and wear footwear for the task', hazard: 'Slip due to unsuitable or worn footwear', control: 'Wear footwear with non-slip soles suited to the work environment (wet, oily, dusty) and replace footwear once tread is worn' },
    ],
    ppe: ['Slip-resistant safety footwear', 'High-visibility clothing (where site visibility is a factor)', 'Safety glasses (where task-relevant)', 'Gloves suited to the task'],
    sources: [
      'https://www.safeworkaustralia.gov.au/system/files/documents/1702/slips_and_trips_fact_sheet.pdf',
      'https://www.safework.nsw.gov.au/hazards-a-z/slips-trips-and-falls-on-the-same-level',
    ],
  },
  {
    hazard: 'working_alone',
    rows: [
      { jobStep: 'Plan a job that will be carried out alone or in an isolated location', hazard: 'No one available to assist or raise the alarm if an incident occurs', control: 'Assess whether the task can be redesigned so the worker is not alone (e.g. buddy system, reschedule to overlap with other workers) before defaulting to solo work' },
      { jobStep: 'Travel to and work at a remote or isolated site', hazard: 'Delayed emergency response due to distance or poor access', control: 'Establish and test a means of communication (mobile phone, satellite device, two-way radio) appropriate to the location before work begins' },
      { jobStep: 'Start work alone', hazard: 'Worker becomes injured, ill or incapacitated with no one aware', control: 'Implement a check-in/check-out procedure with a supervisor or contact person at agreed intervals, and provide a personal duress alarm where the risk warrants it' },
      { jobStep: 'Carry out work in a client’s home, isolated worksite or after hours', hazard: 'Occupational violence or aggression with no support nearby', control: 'Conduct a situational risk assessment of the location beforehand, brief the worker on warning signs, and arrange an escort or reschedule if risk is elevated' },
      { jobStep: 'Continue working through the shift', hazard: 'Psychological harm from prolonged isolation, fatigue or stress with no peer support', control: 'Monitor workload and rostering to limit extended periods of isolated work, and provide the worker regular access to a supervisor for contact' },
      { jobStep: 'Encounter an emergency (injury, vehicle breakdown, medical event)', hazard: 'Inability to summon help in time', control: 'Carry first aid supplies suited to the location, ensure the worker knows the emergency plan, and use a tracking/communication device with GPS where relevant' },
      { jobStep: 'End of shift or task completion', hazard: 'Worker not accounted for if they do not return or report in', control: 'Require a final check-out call/message confirming the worker is safe and the task is complete; escalate to the emergency plan if contact is not made within the agreed time' },
    ],
    ppe: ['Charged mobile phone or satellite communication device', 'Personal duress alarm (where provided)', 'First aid kit suited to the location', 'GPS tracking device (for remote/isolated travel)'],
    sources: [
      'https://www.safeworkaustralia.gov.au/safety-topic/hazards/remote-and-isolated-work/managing-risks',
      'https://www.safework.nsw.gov.au/hazards-a-z/remote-and-isolated-work',
      'https://www.safework.sa.gov.au/__data/assets/pdf_file/0007/136276/Managing-the-work-environment-and-facilities.pdf',
    ],
  },
  {
    hazard: 'hot_work',
    rows: [
      { jobStep: 'Plan hot work (grinding, cutting, welding) and inspect the area', hazard: 'Fire from sparks, slag or molten metal igniting flammable materials', control: 'Identify and remove or control flammable/combustible materials within a minimum 15 metre radius of the work area before starting' },
      { jobStep: 'Set up equipment and work area', hazard: 'Uncontrolled fire spread due to no fire watch or firefighting equipment on hand', control: 'Appoint a fire watcher where required and ensure appropriate firefighting equipment is available at the work area; use a hot work permit to authorise work in hazardous areas' },
      { jobStep: 'Grind, cut or weld metal', hazard: 'Burns from sparks, hot metal or molten slag contacting skin', control: 'Wear fire-resistant PPE (gloves, apron, protective clothing) and use welding screens/curtains to contain sparks and protect nearby workers' },
      { jobStep: 'Work near or inside confined/enclosed areas', hazard: 'Explosion or fire from flammable vapours or gases accumulating', control: 'Ensure adequate ventilation and fume extraction before and during hot work; never carry out hot work on drums, tanks or vessels that have not been confirmed empty and decontaminated' },
      { jobStep: 'Use gas welding/cutting equipment', hazard: 'Gas leak or flashback causing fire or explosion', control: 'Fit flashback arrestors on the operator side of each regulator, secure gas cylinders upright and protected from damage, and check hoses and fittings for damage before use' },
      { jobStep: 'Complete hot work and pack up', hazard: 'Smouldering material igniting after workers leave the area (delayed fire)', control: 'Inspect the work area and surrounds for smouldering materials for a set period after hot work is completed, per the hot work permit' },
      { jobStep: 'Work in a high fire-danger environment (bushfire-prone site, total fire ban)', hazard: 'Fire ignition risk elevated by weather/environmental conditions', control: 'Check fire danger ratings and total fire ban status before starting, and hold or relocate hot work if conditions prohibit it' },
    ],
    ppe: ['Fire-resistant welding gloves', 'Fire-resistant apron/protective clothing', 'Welding helmet or face shield with appropriate shade lens', 'Safety glasses/goggles', 'Respiratory protection (where fume extraction is inadequate)', 'Safety footwear'],
    sources: [
      'https://www.worksafe.wa.gov.au/publications/hot-work-fire-safety-essentials',
      'https://www.safework.nsw.gov.au/safety-alerts/safety-alerts/hot-work',
      'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-welding-processes-v3.pdf',
    ],
  },
  {
    hazard: 'portable_electrical',
    rows: [
      { jobStep: 'Select and set up leads, power boards and portable tools for the job', hazard: 'Electric shock from unauthorised/domestic-grade equipment', control: 'Use only commercial-rated extension leads and power boards (minimum 1mm² conductors); do not use domestic power boards, double adaptors or piggyback plugs on site' },
      { jobStep: 'Inspect equipment before use', hazard: 'Electric shock or fire from damaged cords, plugs or insulation', control: 'Visually inspect leads, plugs and tools for damage before each use; remove damaged equipment from service immediately and apply an out-of-service tag' },
      { jobStep: 'Confirm equipment is within its test cycle', hazard: 'Undetected electrical fault because equipment has not been tested and tagged', control: 'Ensure all portable electrical equipment and leads are inspected and tested to AS/NZS 3760 at intervals not exceeding 3 months in a construction environment, with a current compliance tag attached' },
      { jobStep: 'Connect tools/equipment to power', hazard: 'Electric shock from an undetected earth leakage fault', control: 'Only use equipment connected through an RCD (safety switch) with a rated tripping current no greater than 30mA; test the RCD push-button function before use' },
      { jobStep: 'Run leads across the work area', hazard: 'Damage to cords from vehicles, sharp edges or foot traffic; trip hazard', control: 'Route leads clear of walkways, doorways and sharp edges; use lead stands or cable covers instead of running leads across the floor/ground' },
      { jobStep: 'Use extension leads over distance', hazard: 'Overheating or voltage drop from excessive lead length or daisy-chained leads', control: 'Do not exceed the maximum rated length for the lead’s conductor size and do not join multiple leads beyond the combined maximum length' },
      { jobStep: 'Finish work and pack away equipment', hazard: 'Damaged or untagged equipment reused unsafely next time', control: 'Coil leads properly to avoid damage, report any faults found during use, and keep equipment out of service until retested if a fault is suspected' },
    ],
    ppe: ['Safety footwear', 'Safety glasses', 'Insulated gloves (where working on or near energised leads)', 'Portable RCD/safety switch fitted at the point of use'],
    sources: [
      'https://www.safework.nsw.gov.au/resource-library/construction/electrical-services/electrical-practices-construction-and-demolition-sites-fact-sheet',
      'https://www.safework.sa.gov.au/__data/assets/pdf_file/0018/810531/Inspection-and-Testing-of-Electrical-Equipment-fact-sheet.pdf',
    ],
  },
  {
    hazard: 'noise_exposure',
    rows: [
      { jobStep: 'Plan the task and assess noise exposure', hazard: 'Noise-induced hearing loss (NIHL) from prolonged or high-level exposure to power tools', control: 'Assess the task against the national exposure standard of 85 dB(A) averaged over an 8-hour day (LAeq,8h) and a peak of 140 dB(C), per the Model Code of Practice: Managing Noise and Preventing Hearing Loss at Work' },
      { jobStep: 'Select the tool for the job', hazard: 'High noise output from grinders and cutting tools (bench/angle grinders can produce 88-95 dB(A))', control: 'Where practicable, substitute with a quieter tool or method — e.g. a smaller-diameter grinder (125mm rather than 230mm can cut noise 6-10 dB), low-noise cutting discs (up to 8 dB reduction), or a quieter alternative such as a linisher, guillotine or hand shears' },
      { jobStep: 'Set up the work area before starting', hazard: 'Noise exposure to nearby workers from grinding or cutting', control: 'Relocate or isolate noisy work away from other workers (separate room, outdoors, or an acoustic screen/portable partition placed close to the source); use damped rest pads or isolation mounts on bench or pedestal grinders' },
      { jobStep: 'Inspect and maintain the tool before use', hazard: 'Elevated noise from blunt or poorly maintained equipment', control: 'Keep cutting discs and blades sharp, dress grinding wheels regularly, and replace worn bearings, brushes or other loose components, as poor tool condition increases noise output' },
      { jobStep: 'Carry out the noisy task', hazard: 'Cumulative daily noise dose exceeding the exposure standard', control: 'Limit continuous time on noisy tools and rotate tasks between workers — halving grinding time reduces a worker’s exposure by roughly 3 dB(A) — and take breaks in a quieter area' },
      { jobStep: 'Protect hearing where noise cannot be eliminated at the source', hazard: 'Residual noise above 85 dB(A) after other controls are applied', control: 'Provide and enforce correctly fitted hearing protection (earmuffs and/or earplugs) selected to reduce exposure below the standard, as the last control in the hierarchy — not a substitute for higher-order controls' },
      { jobStep: 'Monitor worker hearing over time', hazard: 'Undetected, progressive hearing loss from repeated exposure', control: 'Arrange baseline audiometric testing within 3 months of a worker starting noisy work, and follow-up testing at least every 2 years (more frequently for workers exposed to average levels of 100 dB(A) or above), paid for by the business' },
    ],
    ppe: ['Earmuffs or earplugs rated to AS/NZS 1270', 'Dual hearing protection (plugs plus muffs) for tasks exceeding ~100 dB(A)', 'Safety glasses/face shield (worn compatibly with hearing protection during grinding/cutting)', 'Hazard signage marking high-noise zones near fixed grinding stations'],
    sources: [
      'https://www.safeworkaustralia.gov.au/system/files/documents/1810/model-cop-managing-noise-and-preventing-hearing-loss-at-work.pdf',
      'https://www.worksafe.vic.gov.au/resources/noise-control-grinders',
      'https://www.safework.nsw.gov.au/hazards-a-z/noise-at-work/hearing-test-requirements-for-nsw-workers',
    ],
  },
  {
    hazard: 'weather_exposure',
    rows: [
      { jobStep: 'Plan the task and check conditions', hazard: 'Heat stress, UV overexposure, or cold stress depending on weather', control: 'Check forecast temperature, UV Index and conditions before starting; where practicable, reschedule outdoor tasks to cooler/lower-UV parts of the day (early morning or late afternoon) when temperatures exceed 30°C or the UV Index is 3 or above' },
      { jobStep: 'Provide drinking water and shade on site', hazard: 'Dehydration and heat illness from prolonged heat exposure', control: 'Provide easy access to cool drinking water and encourage workers to drink often (not energy drinks, soft drink or coffee as a substitute); provide screens, umbrellas, canopies or awnings to create shade for work areas and breaks' },
      { jobStep: 'Schedule work/rest cycles in hot weather', hazard: 'Heat exhaustion or heat stroke from continuous exposure', control: 'Provide regular, frequent breaks in a cool or shaded area, increase worker rotation so no one is continuously exposed, and acclimatise new workers gradually with extra breaks and a reduced initial workload' },
      { jobStep: 'Protect skin from solar UV while working outdoors', hazard: 'Sunburn and long-term skin cancer risk from occupational UV exposure', control: 'Provide and require SPF30+ (or higher) broad-spectrum, water-resistant sunscreen applied 15-20 minutes before going outside and reapplied every 2 hours, a broad-brimmed hat, and UPF50+ rated long-sleeve shirts and pants' },
      { jobStep: 'Dress and equip workers for cold conditions', hazard: 'Cold stress/hypothermia from prolonged exposure to low temperatures, wind or wet conditions', control: 'Use a three-layer clothing system (moisture-wicking inner layer, insulating mid layer, waterproof/windproof outer layer) plus insulated, water-resistant footwear and head/neck/ear coverings; keep a spare dry set of clothing available' },
      { jobStep: 'Manage work in cold environments', hazard: 'Hypothermia from continuous cold exposure and inactivity', control: 'Implement job rotation and regular warm-up breaks, keep workers moving rather than static for long periods, and provide warm food/fluids — avoiding coffee and alcohol, which increase dehydration' },
      { jobStep: 'Monitor workers and respond to warning signs', hazard: 'Undetected heat illness or hypothermia progressing to a medical emergency', control: 'Train workers and supervisors to recognise symptoms (heat illness: headache, nausea, confusion; hypothermia: uncontrollable shivering, slurred speech, irrational behaviour) using a buddy system, and to stop work and seek first aid/medical help immediately if symptoms appear' },
    ],
    ppe: ['Broad-brimmed hat (or brim/legionnaire flap attachment for hard hats) and UV-rated sunglasses', 'SPF30+ broad-spectrum, water-resistant sunscreen and SPF lip balm', 'UPF50+ rated long-sleeve shirt and long pants', 'Layered thermal/wet-weather clothing (wicking inner, insulating mid, waterproof outer) for cold/wet conditions', 'Insulated, water-resistant, anti-slip footwear'],
    sources: [
      'https://www.safeworkaustralia.gov.au/doc/guide-managing-risks-working-heat',
      'https://www.safework.nsw.gov.au/resource-library/heat-and-environment/working-in-extreme-heat-the-facts',
      'https://www.safework.nsw.gov.au/hazards-a-z/cold-environments',
    ],
  },
  {
    hazard: 'biological_hazards',
    rows: [
      { jobStep: 'Identify the biological hazard before starting work', hazard: 'Exposure to pathogens in sewage, mould, or vermin droppings/urine (gastro pathogens, respiratory irritants, leptospirosis)', control: 'Assess the site for signs of sewage contamination, visible mould growth, or rodent activity (droppings, urine, nesting) before work begins, and treat as a biological hazard under the Model Code of Practice: Managing the Risks of Biological Hazards at Work' },
      { jobStep: 'Handle sewage, effluent or contaminated wastewater', hazard: 'Infection from bacteria, viruses or parasites in sewage', control: 'Wear waterproof gloves, enclosed liquid-repellent shoes or rubber boots with non-slip soles, and coveralls or long-sleeve/long-pant work clothing; wash eyes immediately with clean water if splashed with sewage or effluent' },
      { jobStep: 'Work in mould-affected areas', hazard: 'Respiratory illness, asthma-like symptoms or dermatitis from mould spore exposure', control: 'For visible mould, wear a Class P2 particulate respirator, disposable overalls, gloves and safety glasses; close doors and seal air vents where practicable to limit spore spread, and ventilate the area during and after cleanup' },
      { jobStep: 'Enter areas with signs of vermin (droppings, urine, nesting)', hazard: 'Leptospirosis (Weil’s disease) and other diseases transmitted by rodents, most likely during refurbishment or demolition work', control: 'Wear full-fingered puncture-resistant gloves, full-cover waterproof boots, and long-sleeve clothing when contact with contaminated soil, dust or debris is possible; replace gloves or boots immediately if split or leaking' },
      { jobStep: 'Protect open wounds before starting work', hazard: 'Bacterial entry through broken skin during contact with sewage, mould-affected material or vermin-contaminated debris', control: 'Cover all cuts, grazes, abrasions and blisters with a waterproof dressing before starting work; do not proceed if a wound cannot be adequately covered' },
      { jobStep: 'Practise hygiene during and after the job', hazard: 'Cross-contamination or ingestion of pathogens', control: 'Wash hands and arms thoroughly with soap immediately after the task and before eating, drinking or smoking; keep fingernails short and scrubbed; shower and wash exposed clothing separately in hot water after exposure to sewage, mould or rodent-contaminated material' },
      { jobStep: 'Manage ongoing/recurring exposure risk', hazard: 'Repeated occupational exposure to biological hazards in plumbing or reno-demolition work', control: 'Where there is significant, regular risk of exposure (e.g. routine sewage contact), arrange a vaccination program (e.g. Hepatitis A, Tetanus) through a doctor, and conduct regular pest control/monitoring on recurring job sites to reduce rodent populations' },
    ],
    ppe: ['Waterproof/liquid-repellent gloves (puncture-resistant for debris/vermin work)', 'Class P2 particulate respirator (mould or dust-generating biological hazard work)', 'Safety glasses, goggles or face shield', 'Full-cover waterproof/rubber boots with non-slip soles', 'Disposable overalls or waterproof coveralls, long-sleeve and long-pant work clothing'],
    sources: [
      'https://www.worksafe.wa.gov.au/publications/best-practice-guidance-reducing-health-risk-workers-handling-sewage-biosolids-or',
      'https://www.worksafe.wa.gov.au/mould-work',
      'https://www.safework.nsw.gov.au/hazards-a-z/biological-hazards-and-diseases/leptospirosis',
    ],
  },
]
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: same errors as after Task 2 (this file introduces no new consumers yet) — confirm no
NEW errors specific to `jsa-templates.ts` itself (e.g. `JsaHazard`/`SwmsRow` import typos).

- [ ] **Step 3: Commit**

```bash
git add src/lib/jsa-templates.ts
git commit -m "handover: A-3 JSA hazard template library (11 templates)"
```

---

### Task 4: `SwmsBuilderForm.tsx` — branch on docType

**Files:**
- Modify: `src/components/projects/SwmsBuilderForm.tsx`

**Interfaces:**
- Consumes: `JSA_TEMPLATES`, `JSA_HAZARD_LABELS` (Task 3); `JsaHazard`, discriminated
  `SwmsAuthoredContent` (Task 2).
- Produces: `SwmsBuilderForm` takes a new `docType: 'swms' | 'jsa'` prop; its POST payload to
  `/api/projects/[projectId]/swms` now includes `docType` and, for JSA, `whoAtRisk`/`equipment`/
  `emergencyProcedures` — consumed by Task 6.

- [ ] **Step 1: Replace the full contents of `src/components/projects/SwmsBuilderForm.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { SWMS_TEMPLATES, HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_TEMPLATES, JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { HrcwCategory, JsaHazard, SwmsRow, SwmsAuthoredContent } from '@/types/swms'
import type { CrewMemberOption } from '@/types/project-crew'

export default function SwmsBuilderForm({
  clientId, projectId, projectName, docType, crew, crewCertLicenceClasses, currentUserDisplayName, documentId, existingContent,
}: {
  clientId: string
  projectId: string
  projectName: string
  docType: 'swms' | 'jsa'
  crew: CrewMemberOption[]
  crewCertLicenceClasses: { userId: string; licenceClass: string }[]
  currentUserDisplayName: string
  documentId: string | null
  existingContent: SwmsAuthoredContent | null
}) {
  const router = useRouter()
  const [category, setCategory] = useState<HrcwCategory | JsaHazard | ''>(existingContent?.category ?? '')
  const [supervisor, setSupervisor] = useState(existingContent?.supervisor ?? '')
  const [date, setDate] = useState(existingContent?.date ?? new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<SwmsRow[]>(existingContent?.rows ?? [])
  const [ppe, setPpe] = useState<string[]>(existingContent?.ppe ?? [])
  const [consultedUserIds, setConsultedUserIds] = useState<string[]>(existingContent?.consultedUserIds ?? [])
  const [whoAtRisk, setWhoAtRisk] = useState(existingContent?.docType === 'jsa' ? existingContent.whoAtRisk : '')
  const [equipment, setEquipment] = useState(existingContent?.docType === 'jsa' ? existingContent.equipment : '')
  const [emergencyProcedures, setEmergencyProcedures] = useState(existingContent?.docType === 'jsa' ? existingContent.emergencyProcedures : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isJsa = docType === 'jsa'

  const swmsTemplate = useMemo(() => (!isJsa ? SWMS_TEMPLATES.find(t => t.category === category) ?? null : null), [isJsa, category])
  const jsaTemplate = useMemo(() => (isJsa ? JSA_TEMPLATES.find(t => t.hazard === category) ?? null : null), [isJsa, category])
  const hasTemplate = isJsa ? !!jsaTemplate : !!swmsTemplate

  function handleCategoryChange(next: string) {
    setCategory(next as HrcwCategory | JsaHazard)
    if (isJsa) {
      const t = JSA_TEMPLATES.find(x => x.hazard === next)
      setRows(t ? [...t.rows] : [])
      setPpe(t ? [...t.ppe] : [])
    } else {
      const t = SWMS_TEMPLATES.find(x => x.category === next)
      setRows(t ? [...t.rows] : [])
      setPpe(t ? [...t.ppe] : [])
    }
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
  const missingHrwl = !isJsa && swmsTemplate ? swmsTemplate.hrwlClasses.filter(cls => !heldClasses.has(cls)) : []

  async function handleSubmit() {
    if (!category || rows.length === 0) return
    setSaving(true)
    setError(null)
    const consultedNames = crew.filter(c => consultedUserIds.includes(c.userId)).map(c => c.displayName)
    const payload = isJsa
      ? { docType, category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId, whoAtRisk, equipment, emergencyProcedures }
      : { docType, category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId }
    const res = await fetch(`/api/projects/${projectId}/swms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to save')
      return
    }
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}`)
  }

  const categoryOptions = isJsa
    ? JSA_TEMPLATES.map(t => ({ value: t.hazard, label: JSA_HAZARD_LABELS[t.hazard] }))
    : SWMS_TEMPLATES.map(t => ({ value: t.category, label: HRCW_CATEGORY_LABELS[t.category] }))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/clients/${clientId}/projects/${projectId}`} className="text-sm font-semibold text-cyan-600 hover:underline">← Back to project</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100">{isJsa ? 'Build a JSA' : 'Build a SWMS'}</h1>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Pick a category to pre-fill a starting template — edit every row before saving. This is a
            starting point, not a legal sign-off; review the content carefully before relying on it.
          </p>

          <div className="mt-5 space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              {isJsa ? 'Hazard category' : 'High Risk Construction Work category'}
            </label>
            <select
              value={category}
              onChange={e => handleCategoryChange(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="">Select a category…</option>
              {categoryOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {hasTemplate && (
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

              {!isJsa && swmsTemplate?.licenceNote && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs font-medium text-gray-600 dark:text-slate-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{swmsTemplate.licenceNote}</span>
                </div>
              )}

              {!isJsa && missingHrwl.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>This category typically requires: {missingHrwl.join(', ')}. No crew member on this project has a matching certification on file.</span>
                </div>
              )}

              {isJsa && (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Who is at risk</label>
                    <input value={whoAtRisk} onChange={e => setWhoAtRisk(e.target.value)} placeholder="e.g. Worker, other trades on site" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Plant / equipment used</label>
                    <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="e.g. Angle grinder, extension ladder" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Emergency procedures / site contact</label>
                    <input value={emergencyProcedures} onChange={e => setEmergencyProcedures(e.target.value)} placeholder="e.g. First aid kit on ute, site contact 04xx xxx xxx" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
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
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-slate-400">Who was consulted in developing this {isJsa ? 'JSA' : 'SWMS'}?</p>
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
                {saving ? 'Generating…' : isJsa ? 'Generate JSA' : 'Generate SWMS'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: fails only on the caller (`swms/new/page.tsx`, Task 5) not yet passing the new
`docType` prop. Confirm no errors inside `SwmsBuilderForm.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/SwmsBuilderForm.tsx
git commit -m "handover: A-4 SwmsBuilderForm branches on docType (SWMS vs JSA)"
```

---

### Task 5: `swms/new/page.tsx` — read `?type=` and pass docType

**Files:**
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`

**Interfaces:**
- Consumes: `SwmsBuilderForm`'s new `docType` prop (Task 4).
- Produces: page now accepts `?type=jsa` on create; on edit, derives `docType` from the loaded
  document's `content.docType` rather than the query param.

- [ ] **Step 1: Replace the full contents of the file**

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SwmsBuilderForm from '@/components/projects/SwmsBuilderForm'
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsAuthoredContent } from '@/types/swms'

export default async function NewSwmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; projectId: string }>
  searchParams: Promise<{ documentId?: string; type?: string }>
}) {
  const { id, projectId } = await params
  const { documentId, type } = await searchParams
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

  let existingContent: SwmsAuthoredContent | null = null
  if (documentId) {
    const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
    existingContent = (doc?.content as SwmsAuthoredContent | null) ?? null
  }

  const docType: 'swms' | 'jsa' = existingContent?.docType ?? (type === 'jsa' ? 'jsa' : 'swms')

  return (
    <SwmsBuilderForm
      clientId={id}
      projectId={projectId}
      projectName={project.name}
      docType={docType}
      crew={crew}
      crewCertLicenceClasses={crewCertLicenceClasses}
      currentUserDisplayName={user.email ?? 'You'}
      documentId={documentId ?? null}
      existingContent={existingContent}
    />
  )
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: passes for this file. Remaining failures should now only be in the API route (Task 6),
`SwmsDocumentPdf.tsx` (Task 7), the project detail page, and `ProjectSwmsPanel.tsx` (Task 8).

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx"
git commit -m "handover: A-5 swms/new page reads ?type= and derives docType"
```

---

### Task 6: API route — accept `doc_type`

**Files:**
- Modify: `src/app/api/projects/[projectId]/swms/route.ts`

**Interfaces:**
- Consumes: POST payload's `docType` field and (for JSA) `whoAtRisk`/`equipment`/
  `emergencyProcedures` (Task 4). `SwmsDocumentPdf`'s extended prop shape (Task 7 — this task's
  render call must pass the new props once Task 7 lands; write it now so both land together).
- Produces: `project_swms_documents.doc_type` populated on insert (matches Task 1's column).

- [ ] **Step 1: Replace the full contents of the file**

```typescript
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import SwmsDocumentPdf from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent, HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'

// Flat shape for the raw, untrusted request body -- deliberately not
// SwmsAuthoredContent's discriminated union. Destructuring docType into a
// local variable would decouple it from `body`, so checking the local
// variable can't narrow body's type back down to one union member; a flat
// shape with the JSA-only fields optional avoids that entirely.
type SwmsRoutePayload = {
  docType: 'swms' | 'jsa'
  category: HrcwCategory | JsaHazard
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
  consultedNames: string[]
  projectName: string
  documentId?: string
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as SwmsRoutePayload
  const { docType, category, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId, whoAtRisk, equipment, emergencyProcedures } = body

  if (!category || !rows || rows.length === 0) {
    return NextResponse.json({ error: 'A category and at least one job step are required' }, { status: 400 })
  }

  const content: SwmsAuthoredContent = docType === 'jsa'
    ? { docType: 'jsa', category: category as JsaHazard, supervisor, preparedBy, date, rows, ppe, consultedUserIds, whoAtRisk: whoAtRisk ?? '', equipment: equipment ?? '', emergencyProcedures: emergencyProcedures ?? '' }
    : { docType: 'swms', category: category as HrcwCategory, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

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
    projectName, docType, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
    whoAtRisk: docType === 'jsa' ? whoAtRisk : undefined,
    equipment: docType === 'jsa' ? equipment : undefined,
    emergencyProcedures: docType === 'jsa' ? emergencyProcedures : undefined,
    signatures: [],
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = editableExistingPath ?? `${projectId}/${Date.now()}-${docType}-${category}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf', upsert: !!editableExistingPath })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const label = docType === 'jsa' ? 'JSA' : 'SWMS'

  if (editableExistingPath) {
    const { data, error } = await supabase
      .from('project_swms_documents')
      .update({ name: `${label} — ${category}`, category, doc_type: docType, content })
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
      name: `${label} — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      doc_type: docType,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

Note: this task references `SwmsDocumentPdf`'s `docType`/`whoAtRisk`/`equipment`/
`emergencyProcedures`/`signatures` props, which Task 7 (next) adds. Write Tasks 6 and 7 in the
same session so the build passes at the end of Task 7, not necessarily at the end of Task 6.

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: fails on this file's `React.createElement(SwmsDocumentPdf, ...)` call — `docType`,
`whoAtRisk`, `equipment`, `emergencyProcedures`, `signatures` aren't valid props yet. Expected and
fixed by Task 7 — do not treat this as a blocker, proceed to Task 7 immediately.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[projectId]/swms/route.ts"
git commit -m "handover: A-6 API route accepts doc_type and JSA-only fields"
```

---

### Task 7: `SwmsDocumentPdf.tsx` — branch on docType

**Files:**
- Modify: `src/components/projects/SwmsDocumentPdf.tsx`

**Interfaces:**
- Consumes: `HrcwCategory | JsaHazard` category types; `JSA_HAZARD_LABELS` (Task 3).
- Produces: `SwmsDocumentPdf` takes `docType`, optional `whoAtRisk`/`equipment`/
  `emergencyProcedures`, and a `signatures` array prop (empty at creation time — populated later
  by Task 13's live-render route). Consumed by Task 6 (already written) and Task 13.

- [ ] **Step 1: Replace the full contents of the file**

```tsx
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import type { HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'

export type SwmsPdfSignature = {
  name: string
  acknowledgedAt: string
  signatureDataUri: string | null
}

type Props = {
  projectName: string
  docType: 'swms' | 'jsa'
  category: HrcwCategory | JsaHazard
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedNames: string[]
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
  signatures: SwmsPdfSignature[]
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
  signatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 8 },
  signatureImage: { width: 90, height: 32, objectFit: 'contain' },
  signaturePlaceholder: { width: 90, height: 32, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  signatureName: { fontSize: 9, fontWeight: 'bold', color: '#0f172a', minWidth: 120 },
  signatureTimestamp: { fontSize: 8, color: '#64748b' },
})

export default function SwmsDocumentPdf({
  projectName, docType, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  whoAtRisk, equipment, emergencyProcedures, signatures,
}: Props) {
  const title = docType === 'jsa' ? 'Job Safety Analysis' : 'Safe Work Method Statement'
  const categoryLabel = docType === 'jsa' ? JSA_HAZARD_LABELS[category as JsaHazard] : HRCW_CATEGORY_LABELS[category as HrcwCategory]

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{categoryLabel}</Text>
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

        {docType === 'jsa' && (whoAtRisk || equipment || emergencyProcedures) && (
          <View style={styles.metaRow}>
            {whoAtRisk && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Who Is At Risk</Text>
                <Text style={styles.value}>{whoAtRisk}</Text>
              </View>
            )}
            {equipment && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Plant / Equipment</Text>
                <Text style={styles.value}>{equipment}</Text>
              </View>
            )}
            {emergencyProcedures && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Emergency Procedures</Text>
                <Text style={styles.value}>{emergencyProcedures}</Text>
              </View>
            )}
          </View>
        )}

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
          {consultedNames.length > 0 ? `Consulted in developing this ${docType === 'jsa' ? 'JSA' : 'SWMS'}: ${consultedNames.join(', ')}` : 'No crew members recorded as consulted.'}
        </Text>

        <Text style={styles.sectionTitle}>Acknowledgments</Text>
        {signatures.length === 0 && (
          <Text style={styles.consultedList}>No crew members have acknowledged this document yet.</Text>
        )}
        {signatures.map((sig, i) => (
          <View key={i} style={styles.signatureRow}>
            <Text style={styles.signatureName}>{sig.name}</Text>
            {sig.signatureDataUri ? (
              <Image src={sig.signatureDataUri} style={styles.signatureImage} />
            ) : (
              <View style={styles.signaturePlaceholder} />
            )}
            <Text style={styles.signatureTimestamp}>{sig.acknowledgedAt}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: passes for this file and Task 6's route. Remaining failures should now only be in the
project detail page and `ProjectSwmsPanel.tsx` (Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/SwmsDocumentPdf.tsx
git commit -m "handover: A-7 SwmsDocumentPdf branches on docType, adds signatures section"
```

---

### Task 8: `ProjectSwmsPanel.tsx` + project detail page — JSA button and unified list

**Files:**
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `SwmsDocument.docType` (Task 2), `JSA_HAZARD_LABELS` (Task 3).
- Produces: "+ Build JSA" button; document list shows the right label set per `doc_type`.

- [ ] **Step 1: Modify the project detail page's SWMS query and mapping**

Find (around line 69):
```typescript
    const { data: swmsRows } = await supabase
      .from('project_swms_documents')
      .select('id, name, storage_path, category, source')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
```
Replace with:
```typescript
    const { data: swmsRows } = await supabase
      .from('project_swms_documents')
      .select('id, name, storage_path, category, doc_type, source')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
```

Find (around line 78):
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
Replace with:
```typescript
    swmsDocuments = (swmsRows ?? []).map(doc => ({
      id: doc.id,
      name: doc.name,
      storagePath: doc.storage_path,
      category: doc.category as SwmsDocument['category'],
      docType: doc.doc_type as SwmsDocument['docType'],
      source: doc.source as SwmsDocument['source'],
      acknowledgments: (ackRows ?? [])
        .filter(a => a.swms_document_id === doc.id)
        .map(a => ({ userId: a.user_id, acknowledgedAt: a.acknowledged_at })),
    }))
```

- [ ] **Step 2: Modify `ProjectSwmsPanel.tsx`**

Find:
```tsx
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import type { SwmsDocument } from '@/types/swms'
```
Replace with:
```tsx
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { SwmsDocument } from '@/types/swms'
```

Find:
```tsx
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
```
Replace with:
```tsx
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety
        </h2>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new`}
              className="rounded-xl border border-cyan-600 px-4 py-2 text-sm font-semibold text-cyan-600 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
            >
              + Build SWMS
            </Link>
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?type=jsa`}
              className="rounded-xl border border-cyan-600 px-4 py-2 text-sm font-semibold text-cyan-600 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
            >
              + Build JSA
            </Link>
            <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '+ Upload SWMS'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
```

Find:
```tsx
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">{HRCW_CATEGORY_LABELS[doc.category]}</p>
                    )}
```
Replace with:
```tsx
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.docType === 'jsa' ? JSA_HAZARD_LABELS[doc.category as keyof typeof JSA_HAZARD_LABELS] : HRCW_CATEGORY_LABELS[doc.category as keyof typeof HRCW_CATEGORY_LABELS]}
                      </p>
                    )}
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean. This completes Part A — confirm no remaining errors anywhere in the
project.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectSwmsPanel.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx"
git commit -m "handover: A-8 wire Build JSA entry point, unified Safety document list"
```

- [ ] **Step 5: Manual smoke (deferred to the user)**

Build a JSA from a couple of different templates on a trades/construction-profile project;
confirm the PDF generates with "Job Safety Analysis" as the title and the three JSA-only fields
appear; confirm the existing "+ Build SWMS" flow is completely unaffected; confirm both document
types list together in the Safety panel with the right label per row.

---

## Part B — Reusable signatures

### Task 9: Database migration — signatures

**Files:**
- Create: `supabase/schema-109-signatures.sql`

**Interfaces:**
- Produces: `profiles.signature_path` column; private `signatures` storage bucket with owner-only
  RLS.

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 109: Reusable per-user signatures
-- Adds profiles.signature_path plus a private storage bucket so a user
-- draws their signature once (Settings) and it's reused across every
-- SWMS/JSA acknowledgment. RLS is owner-only (read/write your own file
-- only) -- the on-demand PDF route (Task 13) reads other users'
-- signatures via the service-role client, not via RLS, to avoid a
-- cross-referencing policy like the one that caused today's
-- project_members recursion bug. Run via Supabase MCP apply_migration
-- (name: jsa_signatures)
-- ============================================================

alter table public.profiles
  add column signature_path text;

insert into storage.buckets (id, name, public)
  values ('signatures', 'signatures', false)
  on conflict (id) do nothing;

create policy "Users can view their own signature"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own signature"
  on storage.objects for insert
  with check (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own signature"
  on storage.objects for update
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`** (name: `jsa_signatures`)

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'signature_path';

select id, public from storage.buckets where id = 'signatures';

select policyname from pg_policies where tablename = 'objects' and policyname like '%signature%';
```
Expected: `signature_path` column exists; `signatures` bucket exists with `public = false`; three
policies listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-109-signatures.sql
git commit -m "handover: B-1 signatures migration (profiles.signature_path, signatures bucket + RLS)"
```

---

### Task 10: `SignaturePad` component

**Files:**
- Create: `src/components/settings/SignaturePad.tsx`

**Interfaces:**
- Produces: `SignaturePad` — a reusable canvas signature capture/save component, consumed by
  Task 11 (Settings) and Task 12 (inline acknowledgment prompt).

- [ ] **Step 1: Create `src/components/settings/SignaturePad.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function SignaturePad({
  userId,
  initialSignatureUrl,
  onSaved,
}: {
  userId: string
  initialSignatureUrl: string | null
  onSaved?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState(initialSignatureUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx()
    if (!ctx) return
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = getCtx()
    if (!ctx || !lastPointRef.current) return
    const point = pointFromEvent(e)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    setHasDrawn(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setError(null)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return
    setSaving(true)
    setError(null)

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) { setError('Could not export signature.'); setSaving(false); return }

    const supabase = createClient()
    const path = `${userId}/signature.png`
    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(path, blob, { upsert: true, contentType: 'image/png' })
    if (uploadError) { setError(uploadError.message); setSaving(false); return }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ signature_path: path })
      .eq('id', userId)
    if (updateError) { setError(updateError.message); setSaving(false); return }

    const { data } = await supabase.storage.from('signatures').createSignedUrl(path, 3600)
    setSignatureUrl(data?.signedUrl ?? null)
    setSaving(false)
    setSaved(true)
    setHasDrawn(false)
    setTimeout(() => setSaved(false), 3000)
    onSaved?.()
  }

  return (
    <div className="space-y-3">
      {signatureUrl && !hasDrawn && (
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">Current signature</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signatureUrl} alt="Your saved signature" className="h-16 rounded-lg border border-gray-200 bg-white dark:border-slate-700 px-2" />
        </div>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
          {signatureUrl ? 'Draw a new signature to replace it' : 'Draw your signature'}
        </p>
        <canvas
          ref={canvasRef}
          width={400}
          height={140}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="touch-none rounded-xl border border-gray-200 bg-white dark:border-slate-700"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleClear} disabled={!hasDrawn} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50">
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDrawn || saving}
          className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save signature'}
        </button>
        {saved && <span className="text-xs font-semibold text-cyan-500">Saved!</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: passes — this is a new, self-contained file with no other consumers yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SignaturePad.tsx
git commit -m "handover: B-2 SignaturePad component (hand-rolled canvas capture)"
```

---

### Task 11: Settings page — "My signature" card

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `SignaturePad` (Task 10).

- [ ] **Step 1: Extend the profile query**

Find (around line 24):
```typescript
      .select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, logo_url, invoice_payment_details, workspace_profile, username, nickname, avatar_url')
```
Replace with:
```typescript
      .select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, logo_url, invoice_payment_details, workspace_profile, username, nickname, avatar_url, signature_path')
```

- [ ] **Step 2: Add the import and generate a signed URL for the current signature**

Find:
```typescript
import AvatarPicker from '@/components/AvatarPicker'
```
Replace with:
```typescript
import AvatarPicker from '@/components/AvatarPicker'
import SignaturePad from '@/components/settings/SignaturePad'
```

Find (the block right after the `isOrgAdmin`/`plan` computation, before `const profileTab = (`):
```typescript
  const isOwner = membership?.role === 'owner'
  const isSolo = !membership?.org_id
  const showDangerZone = isOwner || isSolo
  const accountLabel = membership?.org_id
    ? (organisation?.name ?? 'your organisation')
    : (profile?.full_name || user.email || 'your account')
```
Replace with:
```typescript
  const isOwner = membership?.role === 'owner'
  const isSolo = !membership?.org_id
  const showDangerZone = isOwner || isSolo
  const accountLabel = membership?.org_id
    ? (organisation?.name ?? 'your organisation')
    : (profile?.full_name || user.email || 'your account')

  let signatureUrl: string | null = null
  if (profile?.signature_path) {
    const { data: signatureSignedUrl } = await supabase.storage.from('signatures').createSignedUrl(profile.signature_path, 3600)
    signatureUrl = signatureSignedUrl?.signedUrl ?? null
  }
```

- [ ] **Step 3: Add the "My signature" card**

Find:
```tsx
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile</h2>
```
Replace with:
```tsx
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">My signature</h2>
        <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
          Draw a signature once — it's reused every time you acknowledge a SWMS or JSA document.
          Redraw it here any time.
        </p>
        <div className="mt-4">
          <SignaturePad userId={profile?.id ?? user.id} initialSignatureUrl={signatureUrl} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile</h2>
```

- [ ] **Step 4: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "handover: B-3 wire My signature card into Settings"
```

- [ ] **Step 6: Manual smoke (deferred to the user)**

Draw a signature in Settings, confirm it saves and the preview shows it; reload the page and
confirm it persists; redraw and confirm it replaces the old one.

---

### Task 12: Require a saved signature before acknowledging

**Files:**
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `SignaturePad` (Task 10).
- Produces: `ProjectSwmsPanel` gains a `hasSignature: boolean` prop; the "I've read and understood
  this" action now opens an inline signature prompt first if the user has none saved.

- [ ] **Step 1: Pass `hasSignature` from the project detail page**

Find (in the `supportsSwms` block, near the crew/swmsDocuments setup):
```typescript
  let crew: CrewMemberOption[] = []
  let availableMembers: CrewMemberOption[] = []
  let swmsDocuments: SwmsDocument[] = []
  let isCrewMember = false
```
Replace with:
```typescript
  let crew: CrewMemberOption[] = []
  let availableMembers: CrewMemberOption[] = []
  let swmsDocuments: SwmsDocument[] = []
  let isCrewMember = false
  let hasSignature = false

  if (supportsSwms) {
    const { data: currentProfile } = await supabase.from('profiles').select('signature_path').eq('id', user.id).maybeSingle()
    hasSignature = !!currentProfile?.signature_path
  }
```

Find the `<ProjectSwmsPanel` usage and add the new prop:
```tsx
            <ProjectSwmsPanel
              clientId={id}
              projectId={project.id}
```
Replace with:
```tsx
            <ProjectSwmsPanel
              clientId={id}
              projectId={project.id}
              hasSignature={hasSignature}
```

(Leave the rest of the existing props on subsequent lines untouched.)

- [ ] **Step 2: Modify `ProjectSwmsPanel.tsx` to prompt for a signature before acknowledging**

Find:
```tsx
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { SwmsDocument } from '@/types/swms'

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
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SwmsDocument | null>(null)
  const [ackingId, setAckingId] = useState<string | null>(null)
```
Replace with:
```tsx
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import SignaturePad from '@/components/settings/SignaturePad'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { SwmsDocument } from '@/types/swms'

export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
  hasSignature,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
  hasSignature: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SwmsDocument | null>(null)
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [signaturePromptDocId, setSignaturePromptDocId] = useState<string | null>(null)
  const [localHasSignature, setLocalHasSignature] = useState(hasSignature)
```

Find:
```tsx
  async function handleAcknowledge(documentId: string) {
    setAckingId(documentId)
    const supabase = createClient()
    await supabase.from('project_swms_acknowledgments').insert({
      swms_document_id: documentId,
      user_id: currentUserId,
    })
    setAckingId(null)
    router.refresh()
  }
```
Replace with:
```tsx
  async function handleAcknowledge(documentId: string) {
    setAckingId(documentId)
    const supabase = createClient()
    await supabase.from('project_swms_acknowledgments').insert({
      swms_document_id: documentId,
      user_id: currentUserId,
    })
    setAckingId(null)
    setSignaturePromptDocId(null)
    router.refresh()
  }

  function handleAcknowledgeClick(documentId: string) {
    if (!localHasSignature) {
      setSignaturePromptDocId(documentId)
      return
    }
    handleAcknowledge(documentId)
  }
```

Find:
```tsx
                    {isCrewMember && !hasAcknowledged && (
                      <button
                        onClick={() => handleAcknowledge(doc.id)}
                        disabled={ackingId === doc.id}
                        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                      >
                        {ackingId === doc.id ? 'Saving…' : "I've read and understood this"}
                      </button>
                    )}
                    {isCrewMember && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
                    {canManage && (
                      <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
```
Replace with:
```tsx
                    {isCrewMember && !hasAcknowledged && (
                      <button
                        onClick={() => handleAcknowledgeClick(doc.id)}
                        disabled={ackingId === doc.id}
                        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                      >
                        {ackingId === doc.id ? 'Saving…' : "I've read and understood this"}
                      </button>
                    )}
                    {isCrewMember && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
                    {canManage && (
                      <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
                {signaturePromptDocId === doc.id && (
                  <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
                    <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300">
                      Draw your signature to confirm you&apos;ve read and understood this document. It&apos;s saved to your profile and reused next time.
                    </p>
                    <SignaturePad
                      userId={currentUserId}
                      initialSignatureUrl={null}
                      onSaved={() => {
                        setLocalHasSignature(true)
                        handleAcknowledge(doc.id)
                      }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectSwmsPanel.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx"
git commit -m "handover: B-4 prompt for a signature before first acknowledgment"
```

---

### Task 13: On-demand signed PDF route + PDF signatures section

**Files:**
- Create: `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`

**Interfaces:**
- Consumes: `SwmsDocumentPdf`'s `signatures` prop (Task 7, already accepts it).
- Produces: `GET /api/projects/[projectId]/swms/[documentId]/pdf` — live-renders an authored
  document's PDF with current acknowledgment signatures baked in. Consumed by Task 14.

- [ ] **Step 1: Create the route**

```typescript
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS-scoped read with the requester's own session -- if this returns a
  // row, they're entitled to view it. Only after this check do we switch to
  // the service client, and only to fetch signature image files.
  const { data: doc, error: docError } = await supabase
    .from('project_swms_documents')
    .select('id, name, content, source')
    .eq('id', documentId)
    .eq('project_id', projectId)
    .single()

  if (docError || !doc || doc.source !== 'authored' || !doc.content) {
    return NextResponse.json({ error: 'Document not found or not available for live rendering' }, { status: 404 })
  }

  const { data: projectRow } = await supabase.from('projects').select('name').eq('id', projectId).single()

  const { data: acks } = await supabase
    .from('project_swms_acknowledgments')
    .select('user_id, acknowledged_at')
    .eq('swms_document_id', documentId)
    .order('acknowledged_at', { ascending: true })

  const content = doc.content as SwmsAuthoredContent
  const consultedUserIds = content.consultedUserIds ?? []
  const ackUserIds = (acks ?? []).map(a => a.user_id)
  const allUserIds = Array.from(new Set([...ackUserIds, ...consultedUserIds]))

  const service = createServiceClient()
  const { data: profiles } = allUserIds.length > 0
    ? await service.from('profiles').select('id, full_name, username, signature_path').in('id', allUserIds)
    : { data: [] as { id: string; full_name: string | null; username: string | null; signature_path: string | null }[] }

  function nameFor(id: string): string {
    const p = (profiles ?? []).find(row => row.id === id)
    return p?.full_name || p?.username || 'Unknown'
  }

  const consultedNames = consultedUserIds.map(nameFor)

  const signatures: SwmsPdfSignature[] = await Promise.all((acks ?? []).map(async ack => {
    const profile = (profiles ?? []).find(p => p.id === ack.user_id)
    let signatureDataUri: string | null = null
    if (profile?.signature_path) {
      const { data: fileData } = await service.storage.from('signatures').download(profile.signature_path)
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer())
        signatureDataUri = `data:image/png;base64,${buffer.toString('base64')}`
      }
    }
    return {
      name: nameFor(ack.user_id),
      acknowledgedAt: ack.acknowledged_at as string,
      signatureDataUri,
    }
  }))

  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    docType: content.docType,
    category: content.category,
    supervisor: content.supervisor,
    preparedBy: content.preparedBy,
    date: content.date,
    rows: content.rows,
    ppe: content.ppe,
    consultedNames,
    whoAtRisk: content.docType === 'jsa' ? content.whoAtRisk : undefined,
    equipment: content.docType === 'jsa' ? content.equipment : undefined,
    emergencyProcedures: content.docType === 'jsa' ? content.emergencyProcedures : undefined,
    signatures,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.name}.pdf"`,
    },
  })
}
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts"
git commit -m "handover: B-5 on-demand signed PDF route for authored SWMS/JSA documents"
```

---

### Task 14: `ProjectSwmsPanel.tsx` — View branches by source

**Files:**
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`

**Interfaces:**
- Consumes: the new PDF route (Task 13).
- Produces: "View" opens the live-rendered signed PDF for authored documents; uploaded documents
  are unaffected.

- [ ] **Step 1: Modify `handleView` and its caller**

Find:
```tsx
  async function handleView(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('project-swms').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
```
Replace with:
```tsx
  async function handleView(doc: SwmsDocument) {
    if (doc.source === 'authored') {
      window.open(`/api/projects/${projectId}/swms/${doc.id}/pdf`, '_blank')
      return
    }
    const supabase = createClient()
    const { data } = await supabase.storage.from('project-swms').createSignedUrl(doc.storagePath, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
```

Find:
```tsx
                    <button onClick={() => handleView(doc.storagePath)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
```
Replace with:
```tsx
                    <button onClick={() => handleView(doc)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
```

- [ ] **Step 2: Run the build**

```bash
pnpm run build
```
Expected: passes clean. This completes Part B.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectSwmsPanel.tsx
git commit -m "handover: B-6 View opens live-signed PDF for authored documents"
```

- [ ] **Step 4: Manual smoke (deferred to the user)**

Acknowledge a document as a crew member with no signature saved — confirm the inline prompt
appears, blocks until drawn, and completes the acknowledgment once saved. View an authored
document with 2+ acknowledgments and confirm every name, signature image, and timestamp appears
correctly on the generated PDF. Confirm an uploaded (non-authored) SWMS still acknowledges fine
and "View" still opens the original uploaded file unchanged.

---

## Acceptance checklist

- [ ] Part A: JSA builds from any of the 11 templates, generates a correctly-titled PDF, coexists
  cleanly with the unmodified SWMS flow, and both list together in one Safety panel.
- [ ] Part B: a user draws one reusable signature in Settings; acknowledging any SWMS/JSA prompts
  for it once if missing; viewing an authored document live-renders current signatures; uploaded
  documents are completely unaffected.
- [ ] Full `pnpm run build` passes clean end-to-end after each task.
- [ ] Manual smoke per Task 8 Step 5 and Task 14 Step 4 — user follow-up, not the conductor's to
  complete.
