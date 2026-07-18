# SWMS Form Builder — Design

## Goal

The just-shipped SWMS + Licence Tracking phase only supports **uploading** an existing SWMS
(Safe Work Method Statement) file. Most small trades/construction businesses don't have one —
they'd need to author it from scratch. This phase adds an in-app form builder: fill in a
structured form, get a real branded PDF generated automatically, following the exact pattern
already proven for invoices.

Direct follow-up request from the user immediately after the SWMS phase shipped, framed as: "then
they can be added same as invoices and quotes etc if theres no legitimate pdf builder." There is
one — `@react-pdf/renderer`, already used in production for `InvoiceDocument.tsx` and
`PayslipDocument.tsx` (server route calls `renderToBuffer()` on a React-PDF component, uploads/
streams the resulting file). This phase reuses that pattern rather than adding a new dependency.

## Architecture

Extend the existing `project_swms_documents` table (no new table) with three columns:

- `category` — one of the 18 legislated High Risk Construction Work (HRCW) types (nullable; null
  for uploaded files, which have no category)
- `content` — `jsonb`, the structured form answers (header fields, job-step/hazard/control rows,
  PPE, licence classes, consultation record)
- `source` — `'uploaded' | 'authored'`

Authoring flow: user fills the form → a new server route
(`/api/projects/[projectId]/swms/route.ts`, `POST`) renders a `SwmsDocumentPdf` React-PDF
component (new file, `src/components/projects/SwmsDocumentPdf.tsx`, structured the same way as
`InvoiceDocument.tsx`) via `renderToBuffer()` → uploads the resulting PDF into the existing private
`project-swms` storage bucket (same bucket uploaded files already use) → inserts a
`project_swms_documents` row with `storage_path` pointing at the generated PDF, plus `content`/
`category`/`source: 'authored'`.

Critically, **viewing, acknowledging, and deleting all keep working completely unchanged** —
`ProjectSwmsPanel.tsx`'s existing code only ever reads `storage_path` to generate a signed URL; it
never needs to know whether a document was uploaded or authored. The only new UI is the entry
point (a second button) and the new build page itself.

## The 18 HRCW categories

Verified against Safe Work Australia's WHS Regulations content (see Sources below), not from
memory:

1. Risk of a person falling more than 2 metres
2. Work carried out on a telecommunication tower
3. Demolition of a load-bearing (or structurally significant) element
4. Work that involves, or is likely to involve, disturbance of asbestos
5. Structural alterations or repairs requiring temporary support to prevent collapse
6. Work carried out in or near a confined space
7. Work in or near a shaft or trench with excavated depth greater than 1.5 metres
8. Work in or near a tunnel
9. Use of explosives
10. Work on or near pressurised gas distribution mains or piping
11. Work on or near chemical, fuel, or refrigerant lines
12. Work on or near energised electrical installations or services
13. Work in an area that may have a contaminated or flammable atmosphere
14. Work involving tilt-up or precast concrete
15. Work on, in, or adjacent to a road, railway, shipping lane, or other traffic corridor in use by
    traffic other than pedestrians
16. Work in an area with any movement of powered mobile plant
17. Work in an area with artificial extremes of temperature
18. Work in or near water or other liquid involving a risk of drowning

## Template content

Each category gets a template: typical job steps, hazards, control measures, required PPE, and
(where applicable) High Risk Work Licence classes commonly required. Stored as a static TypeScript
module (`src/lib/swms-templates.ts`), **not** a database table — this is codebase-maintained
reference content, not tenant data, so it belongs in version control where changes go through real
review, same as any other reference constant in this repo.

**This content is explicitly not written during design/brainstorming.** Getting 18 categories'
worth of hazard/control content right requires real, sourced research against SafeWork Australia
and state-authority guidance for each one — the same kind of dedicated research pass used earlier
this project for the original construction-features research (three parallel agents). The
implementation plan's first task dispatches parallel research agents, several categories each, each
required to cite real sources — not invent content from general knowledge. A category's template
is a starting point the user edits per job, not a legal document on its own; the form always
requires review before submission, same as any of the other 17 categories' users would do with a
paper template today.

Selecting a category pre-fills the job-step/hazard/control table (add/remove/edit rows freely from
there), plus the PPE and licence-class lists for that category.

## Form UX

New route: `/dashboard/clients/[id]/projects/[projectId]/swms/new`, following the same
"complex form gets its own page" pattern as `NewInvoiceForm`'s `/dashboard/invoices/new` — not a
modal, given the number of fields and the dynamic job-step table.

Reached via a new "+ Build SWMS" button in `ProjectSwmsPanel.tsx`, alongside the existing
"+ Upload SWMS" button — both paths coexist. A subcontractor-supplied or externally-authored SWMS
still gets uploaded as a file; an in-house one gets built.

Flow:
1. Pick a category (the 18 HRCW types) — pre-fills the table below
2. Header fields: project name (from the project), prepared-by/date (defaults to current user/
   today), supervisor (editable)
3. Job-step/hazard/control table — pre-filled from the category template, fully editable
4. PPE checklist — pre-filled from the template, editable
5. Required licence classes for this category — shown with the crew cross-check (see below)
6. Consultation — lists the project's crew (from `ProjectCrewPanel`'s existing data) with
   checkboxes for who was consulted in developing this SWMS (a genuine WHS requirement, not
   decoration)
7. Submit generates the PDF and saves, identical end state to an upload

## Document lifecycle (editing)

Before any crew member has acknowledged a SWMS document, it can be edited in place — nothing's
been relied on yet, no reason to force a new document over a typo fix. Once at least one
acknowledgment exists, further changes create a **new** `project_swms_documents` row rather than
mutating the acknowledged one — the old document stays visible (not deleted), acknowledgments
don't carry over, and crew must acknowledge the new version fresh. This matches the real
requirement that workers actually see and understand changes, not just that a document technically
exists.

Note: `ProjectSwmsPanel` already supports outright deleting any SWMS document (uploaded or
authored) — that's pre-existing behavior from the prior phase, not something this phase changes or
needs to relitigate.

## Licence cross-check

Add an optional `licence_class` column to the existing `certifications` table (nullable text/enum
— exact enum values for the ~10 standard Australian High Risk Work Licence classes, e.g.
scaffolding/dogging/rigging/crane variants, get verified during the same research task that sources
the 18 category templates, not guessed here). When adding a certification in `EmployeeDrawer`, a
dropdown lets the user optionally tag it with a licence class.

**This dropdown only renders for organisations whose workspace profile has `supportsSwms: true`**
(the same flag gating Crew/SWMS today — `builder_construction` and `trades_field_services`). A
tutoring org's certification form is completely unaffected — no new field, no clutter for a
business type where "High Risk Work Licence" is meaningless.

On the SWMS build page, each category's required licence classes are checked against the project
crew's certifications (matched on `licence_class`, not fuzzy name-matching — reliable but requires
the class to have been tagged). If nobody on the crew holds a listed class, a **soft warning**
shows — doesn't block saving, just surfaces the gap. Certifications entered before this ships have
`licence_class = null` until someone goes back and tags them; until then they simply won't
contribute to a match (same as any newly-added optional field on existing rows).

**Real finding from the category research (below): most of the 18 categories don't require an
HRWL at all.** Only tilt-up/precast concrete and powered mobile plant map cleanly onto HRWL
classes (plus HRWL components hiding inside a few others — e.g. rigging/crane work incidental to
demolition, an EWP boom ≥11m for falls/tower work). The rest require a completely different,
separately-issued credential: a state electrical licence (energised electrical work), a state
gasfitting licence (pressurised gas mains), a state demolition licence (not nationally
standardized — e.g. NSW's DE1/DE2), a Class A/B asbestos removal licence, a state shotfirer's
licence (explosives), an ARCtick refrigerant handling licence (chemical/fuel/refrigerant lines),
or a state traffic-controller ticket (traffic corridor work). `licence_class` stays scoped to the
real 29 HRWL codes only — cleanly matchable against `certifications`. For every other category,
the template carries an **informational note** instead ("Requires a state-issued electrical
licence — not cross-checked against Certifications, confirm your crew holds one"), shown on the
build page with no automated match attempted. This is more honest than pretending a broader
match is being verified when it isn't — cross-checking demolition licences alone would need
state-varying logic (NSW's codes aren't national), which is real scope not worth taking on this
phase.

## Explicitly out of scope this phase

- Replacing the upload path — both stay
- Full legal sign-off/validation that a generated SWMS is compliant — this is an authoring aid,
  the business is still responsible for reviewing content before relying on it, same as a paper
  template
- Verifying a licence class against any external/official registry — this only cross-references
  the business's own certification records, not a real licence lookup
- Template content for anything beyond the 18 legislated HRCW categories

## Verification

No test runner in this project — `pnpm run build` (tsc + eslint) after every implementation task,
per the existing convention. Manual smoke (deferred to the user, same precedent as every prior
phase): build a SWMS from a template, confirm the PDF generates and matches what was entered,
confirm the licence warning appears/doesn't appear correctly for a crew with/without a matching
certification, confirm editing before vs after an acknowledgment behaves as designed, confirm a
tutoring-profile org's certification form shows no licence-class field.

## Sources

- [High risk construction work requiring a SWMS | Safe Work Australia](https://www.safeworkaustralia.gov.au/duties-tool/construction/hazards-information/high-risk-construction-work-requiring-swms)
- [The 18 High-Risk Construction Work Activities in Australia (WHS Regulations) | BlueSafe Online](https://www.bluesafeonline.com.au/resources/compliance-guides/high-risk-construction-work-list)
