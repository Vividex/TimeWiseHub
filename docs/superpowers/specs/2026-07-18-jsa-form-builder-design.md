# JSA (Job Safety Analysis) Form Builder — Design

## Goal

The SWMS Form Builder (shipped earlier today) only covers the 18 legislated High Risk
Construction Work (HRCW) categories — genuinely correct, since a SWMS is only a *legal*
requirement for those. But most of what a small trades/construction business actually does
day-to-day isn't HRCW-scale: ladders under 2m, hand and power tools, chemicals, manual handling.
That work still carries real hazards and businesses still want a document on file for insurance,
principal-contractor requirements, and general WHS duty-of-care — it just isn't a SWMS. The
correct document for that is a **Job Safety Analysis (JSA)**, confirmed as the live, correct term
via SafeWork Australia's own SWMS information sheet (which explicitly distinguishes SWMS from
JSA) and WorkSafe Victoria's JSA template.

Raised directly by the user after testing the SWMS builder live: "most businesses that are
carrying out large scale, high risk works will likely have their own processes... this needs to
be better suited to small businesses carrying out small scale work."

Also folds in a gap found while reviewing the already-shipped SWMS PDF: it has no sign-off area at
all beyond an in-app "acknowledge" click. This phase adds a reusable digital signature (drawn once
per user, redrawable any time) used by **both** SWMS and JSA — a retroactive enhancement to the
already-shipped SWMS document, not JSA-only scope.

## Architecture

**One shared system, not a parallel one.** Extend the existing `project_swms_documents` table
with a single new column:

- `doc_type` — `'swms' | 'jsa'`, `not null default 'swms'` (every existing row stays valid, zero
  backfill)

Everything else is reused unchanged: the `project-swms` storage bucket, the
`project_swms_acknowledgments` table and its full crew sign-off lifecycle, all existing RLS
policies (none reference `category` or any SWMS-specific value, so nothing needs touching), the
edit-before-acknowledgment / supersede-after-acknowledgment lifecycle, and the delete flow.

This mirrors how `source: 'uploaded' | 'authored'` already extended the same table for the
Form Builder phase — a document table distinguishing document flavours via a discriminator column
is the established pattern here, not a new one.

Rejected alternative: a fully separate `project_jsa_documents` table/route/storage bucket/RLS set.
Heavy duplication for a document that's structurally identical to SWMS (job-step/hazard/control
rows, PPE, supervisor/date, crew consultation), and copy-pasted RLS policies are exactly how the
`project_members` infinite-recursion bug (fixed as `schema-107`, same day) happened — not worth
repeating that risk for no real benefit.

## Types

`SwmsAuthoredContent` becomes a discriminated union on `docType`:

```ts
type SwmsAuthoredContentBase = {
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
}

type SwmsAuthoredContent =
  | (SwmsAuthoredContentBase & { docType: 'swms'; category: HrcwCategory })
  | (SwmsAuthoredContentBase & {
      docType: 'jsa'
      category: JsaHazard
      whoAtRisk: string
      equipment: string
      emergencyProcedures: string
    })
```

`SwmsRow` (`jobStep`/`hazard`/`control`) is unchanged and shared by both branches — no risk-rating
field. Real AU JSA templates are inconsistent on this: SafeWork NSW's "Task Hazard Analysis
Template" and WorkSafe Victoria's "Job Safety Analysis Worksheet" (both read directly as primary
sources) have no risk matrix at all; more elaborate templates (e.g. university EHS JSAs) do, always
as a before/after Low/Medium/High pair. Given the target here is a fast one-page job for small
work, and the two actual regulator "keep it simple" templates skip it, this phase skips it too.

The three JSA-only fields (`whoAtRisk`, `equipment`, `emergencyProcedures`) come from the same
research pass — more consistently present across real templates than the risk rating itself.
`SwmsDocument` (the read-side type) gets `docType: 'swms' | 'jsa'` alongside its existing
`category` field.

## JSA hazard library

New static module, `src/lib/jsa-templates.ts`, structured identically to `swms-templates.ts` minus
the licence-related fields (no `hrwlClasses`, no `licenceNote` — none of these hazards trigger a
High Risk Work Licence):

```ts
type JsaTemplate = {
  hazard: JsaHazard
  rows: SwmsRow[]
  ppe: string[]
  sources: string[]
}
```

11 templates, each requiring the same real-sourced-content standard as the 18 HRCW templates (no
invented content — the implementation plan's template-writing task cites SafeWork Australia/state
regulator sources per template, same as the SWMS library):

1. Working from a ladder/step (below the 2m HRCW threshold)
2. Hand & power tool use (grinders, drills, saws)
3. Hazardous substances/chemicals (including dust/silica from cutting, drilling, sanding —
   folded in here rather than a separate entry, since SafeWork Australia's silica guidance shares
   the same control hierarchy — wet-cutting/LEV/RPE — as general chemical handling)
4. Manual handling (lifting/carrying)
5. Slips, trips and falls on the same level
6. Working alone / isolated locations
7. Hot work (grinding, cutting, welding sparks)
8. Portable electrical equipment & leads (not energised installations — that stays HRCW/SWMS)
9. Noise exposure (power tools; distinct hazard pathway from tool handling itself, per SafeWork
   Australia's dedicated Noise Model Code of Practice)
10. Weather/environmental exposure — UV, heat, cold (SafeWork Australia's "working in the sun"/
    "working in heat" guidance; outdoor workers get materially higher UV exposure)
11. Biological hazards — sewage, mould, vermin (recurring in plumbing/renovation work per SafeWork
    Australia and trade safety guidance; distinct from chemical handling)

## Form UX

Reuses the existing route rather than adding a new one: `/dashboard/clients/[id]/projects/
[projectId]/swms/new` gains a `?type=jsa` query param (defaults to `swms`), and
`SwmsBuilderForm.tsx` branches its category picker (`SWMS_TEMPLATES`/`HrcwCategory` vs
`JSA_TEMPLATES`/`JsaHazard`) and fields based on it. The HRWL licence cross-check block renders
only for `docType === 'swms'`; the three JSA-only fields (who's at risk, equipment, emergency
procedures) render only for `docType === 'jsa'`.

`ProjectSwmsPanel.tsx` changes:
- Section header: `"Safety (SWMS)"` → `"Safety"` (no longer SWMS-only)
- New `"+ Build JSA"` button alongside the existing `"+ Build SWMS"` and `"+ Upload SWMS"` buttons,
  linking to the same route with `?type=jsa`
- The document list becomes unified — both SWMS and JSA documents listed together, each row's
  category-label line shows the right label set (`HRCW_CATEGORY_LABELS` or a new
  `JSA_HAZARD_LABELS`) based on `doc_type`

## API

`POST /api/projects/[projectId]/swms/route.ts` (same endpoint, not a new one) accepts `doc_type`
in the request body alongside `category`, defaulting to `'swms'` for backward compatibility with
any in-flight requests. Validation requires `category` and at least one row regardless of
`doc_type`. The generated PDF's document name (`"SWMS — ${category}"` today) becomes
type-aware (`"SWMS — ${category}"` vs `"JSA — ${category}"`).

## PDF

`SwmsDocumentPdf.tsx` (same component, not a new one) takes a `docType` prop and branches:
- Title: "Safe Work Method Statement" vs "Job Safety Analysis"
- Skips the licence-classes section entirely for JSA
- Renders the three JSA-only fields (who's at risk, equipment, emergency procedures) only when
  present

## Signatures

**One saved signature per user, reusable and redrawable.** New column `profiles.signature_path`
(mirrors the existing `logo_url` pattern from invoice letterheads exactly — a small per-user image,
just private rather than public). Drawn via a new hand-rolled canvas component
(`src/components/settings/SignaturePad.tsx`), following the same capture/export shape already
proven twice in this codebase: freehand stroke capture like `WhiteboardCanvas.tsx`, exported to a
PNG blob like `LogoUpload.tsx`'s `flattenToJpeg`. No new dependency. Lives in Settings, under a new
"My signature" section — draw, save, clear and redraw any time.

Storage: a new **private** bucket `signatures` (unlike the public `logos` bucket — a signature is
more identity-sensitive than a company logo, so it follows `project-swms`'s private/signed-URL
pattern instead). RLS: a user can read/write only their own signature file. Server-side PDF
generation (below) needs to read *other* users' signatures — rather than building a
cross-referencing RLS policy for that (exactly the pattern that caused today's `project_members`
recursion bug), the PDF-rendering route does its access check with the normal user-session
client first (a scoped read of the `project_swms_documents` row — if RLS lets it through, the
requester is entitled to view it), then switches to `createServiceClient()` only to fetch the
signature image files themselves. Simpler than a cross-user RLS policy and avoids repeating
today's risk.

**Acknowledgment stays a single checkbox** ("by checking this box you acknowledge...") — no per-
document signature capture. The first time a crew member tries to check it with no
`signature_path` saved yet, the checkbox action opens `SignaturePad` inline, saves it to their
profile, then completes the acknowledgment — once only, never again on future documents.

**PDF generation moves from creation-time-only to also on-demand, for authored documents only.**
Today's SWMS PDF is rendered once at submission and served forever after from the stored file at
`storage_path`. That still happens unchanged at creation. But "View"/"Download" for an **authored**
document now hits a new route (`GET /api/projects/[projectId]/swms/[documentId]/pdf`) that
live-renders fresh from `content` plus a current join across `project_swms_acknowledgments` —
each row's name, timestamp, and current `profiles.signature_path` — so the PDF always reflects
who's signed as of the moment it's opened, without needing to regenerate and re-upload a stored
file every time someone acknowledges. `ProjectSwmsPanel.tsx`'s View/Download branches on
`source`: `'authored'` hits the new live-render route, `'uploaded'` keeps generating a signed URL
straight to `storage_path` exactly as today.

This is an explicit, intentional tradeoff: the signature shown is whatever a user's **current**
saved signature looks like when the PDF is generated, not a frozen snapshot from the moment they
originally acknowledged. If someone redraws their signature later, older documents they'd already
signed will show the new signature next time they're opened. That matches what was asked for
(reusable, changeable signature) rather than a per-signing snapshot — flagged here as a known
behavior, not an oversight.

**Uploaded (non-authored) SWMS documents are unaffected.** "View"/"Download" keeps serving the
static uploaded file exactly as today — the app has no way to inject a signature block into an
arbitrary uploaded PDF without a PDF-editing dependency, which is out of scope. The checkbox
acknowledgment (and the same first-time signature-pad prompt) still applies and is still tracked
and visible in-app; it just isn't rendered onto that particular file.

## Gating

Same as SWMS today — `supportsSwms` workspace-profile flag (`builder_construction` and
`trades_field_services` only). Not extending to other profiles (e.g. cleaning) this phase, even
though the hazards are relevant there too — keeps this phase's surface area matched to what
already ships, easy to extend later once the pattern's proven.

## Explicitly out of scope this phase

- Risk-rating (likelihood × consequence) fields — deliberately skipped, see Types section above
- Extending gating beyond `builder_construction`/`trades_field_services`
- A blank/freeform JSA path with no starting template — every JSA starts from one of the 11
  library entries, edited from there, same UX as SWMS
- Rendering signatures onto uploaded (non-authored) SWMS PDFs — not technically feasible without a
  new PDF-editing dependency; acknowledgment is still tracked and visible in-app regardless
- Freezing a signature snapshot at the moment of each acknowledgment — the current profile
  signature always renders, see Signatures section above
- Any signature legal-validity/verification guarantee — same "authoring aid, business reviews
  before relying on it" framing as the rest of this document

## Verification

`pnpm run build` after every implementation task, per house convention. Manual smoke (deferred to
the user): build a JSA from each of a few templates, confirm the PDF generates with the right
title and no licence-check section, confirm the SWMS path is completely unaffected (existing
documents still show correctly, "+ Build SWMS" still works exactly as before), confirm both doc
types list together correctly in `ProjectSwmsPanel`, confirm a tutoring-profile org sees neither
button. Signatures: draw and save one in Settings and confirm it persists and can be redrawn;
acknowledge a document as a crew member with no signature saved yet and confirm the inline prompt
blocks until one's drawn; download a document with 2+ acknowledgments and confirm every name,
signature, and timestamp appears correctly; confirm an uploaded (non-authored) SWMS still
acknowledges fine with no signature baked into its file.

## Sources

- [SafeWork NSW — Task Hazard Analysis Template](https://www.safework.nsw.gov.au) (read directly;
  no risk matrix, columns: task steps / hazards & causes / consequences / actions / who / by when)
- [WorkSafe Victoria — Job Safety Analysis Worksheet](https://www.worksafe.vic.gov.au) (read
  directly; no risk matrix, columns: activity / hazards / risk control measures / who's responsible)
- [Safe Work Australia — Noise](https://www.safeworkaustralia.gov.au) (Model Code of Practice)
- [Safe Work Australia — Working in heat / UV exposure guidance](https://www.safeworkaustralia.gov.au)
- [Safe Work Australia — Silica guidance and Model Code of Practice](https://www.safeworkaustralia.gov.au)
- [Safe Work Australia — SWMS information sheet](https://www.safeworkaustralia.gov.au) (confirms
  SWMS vs JSA as distinct, both real terms)
