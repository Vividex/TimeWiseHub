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
