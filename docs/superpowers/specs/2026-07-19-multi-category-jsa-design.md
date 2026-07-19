# Multi-Category JSA Design

## Goal
Let a JSA (Job Safety Analysis) cover multiple hazard categories in one document — a real job
often spans several (e.g. ladder work AND power tools) — instead of forcing exactly one category
per document today. SWMS (Safe Work Method Statement) documents are unaffected and stay
single-category.

## Background
`SwmsBuilderForm.tsx` currently has one `<select>` for either a SWMS's High Risk Construction
Work category or a JSA's hazard category. Picking one populates `rows`/`ppe` from that category's
template (`SWMS_TEMPLATES`/`JSA_TEMPLATES`); picking a *different* one wholesale replaces
`rows`/`ppe`, destroying any edits. There is no way to combine two categories into one document
today.

## Scope decision
Only JSA gets multi-category. SWMS stays single-category — HRCW work types are legislated,
discrete categories with their own licence-class cross-check (`missingHrwl`), and mixing several
into one document would complicate that check for no benefit; you didn't ask for it either
("jsa should be able to select multiple categories per jsa").

## Data model
- `SwmsRow` gains an optional tag: `{ jobStep: string; hazard: string; control: string; category?: JsaHazard }`.
  Rows added from a template carry that template's hazard key; rows added manually (the existing
  "+ Add row" button) carry no tag.
- `SwmsAuthoredContent`'s `docType: 'jsa'` branch changes `category: JsaHazard` to
  `categories: JsaHazard[]`. The `docType: 'swms'` branch is unchanged (`category: HrcwCategory`,
  singular).
- `ppe: string[]` is unchanged — PPE is not grouped by category. Checking a category merges its
  template's PPE items into the flat list, deduplicated by exact text match. A "safety glasses"
  chip doesn't need to remember which of two hazards it came from; a flat checklist is more useful
  than a redundant grouped one here.
- Editing a pre-existing (single-category) JSA: its stored `content.category` (old singular field)
  is normalized to a one-item `categories` array when loaded, so old documents open correctly in
  the new form.

## Builder form behavior
The single category `<select>` becomes a checklist (JSA only — SWMS keeps its existing dropdown
unchanged). Checking a category:
- Appends a fresh copy of its template's rows to the flat `rows` list, each tagged with that
  category.
- Merges its template's PPE items into `ppe`, deduplicated by exact text.

Unchecking a category **removes every row tagged with it**, including any edits made to those
rows — the checkbox represents that category's group being present in the document, so
unchecking removes the group. This is flagged directly in the UI (a short line near the checklist:
"Removing a category deletes its rows below") so it's never a silent surprise. PPE items are
**not** removed when a category is unchecked (they're untagged and shared) — a user manually
removes a PPE item via the existing per-item Remove button if it no longer applies. Manually-added
rows (via "+ Add row") are never affected by any checkbox toggling.

The Job Steps section renders one collapsible block per checked category (e.g. "▸ Hand & power
tool use (7 steps)"), expanded by default when first checked, collapsible afterward for scanning.
An always-visible "Additional steps" section at the bottom holds untagged (manually-added) rows —
not collapsible, since it's typically short.

## Storage
No database migration. `project_swms_documents.category` (existing free-text column, already used
only for display lookups, never filtered on) stores a comma-joined list of hazard keys for
multi-category JSAs, e.g. `"ladder_step,hand_power_tools"`. The document's `name` field (shown in
the document list) becomes `JSA — <first category label> +N more` when more than one category is
selected, matching the existing `<label> — <category>` naming pattern for the single-category
case.

## Display updates
Three existing places resolve `SwmsDocument.category` into a label and need to instead split on
comma and join the resolved labels (e.g. "Ladder/step work + Hand & power tool use"):
1. The project's SWMS/JSA document list (`ProjectSwmsPanel.tsx`).
2. The Dashboard "Today" pending-signature card (`swms-awaiting-signature.ts`).
3. The generated PDF's subtitle (`SwmsDocumentPdf.tsx`, via the pdf route passing resolved labels
   through).

## PDF output
The generated PDF's job-steps table mirrors the on-screen grouping — one sub-table per category
(with its own heading) plus an "Additional steps" sub-table for untagged rows — rather than one
flat table, so the printed/relied-on document matches what was built on screen.

## Testing
No test runner in this project — the gate is `pnpm run build`. Manual smoke (deferred to the
user): as a manager on a construction/trades-profile org, build a new JSA, check two categories,
confirm both template's rows/PPE appear grouped and merged without duplicates; uncheck one and
confirm only its rows disappear; add a manual row and confirm it survives category toggling;
generate the PDF and confirm it shows grouped sections matching the screen; open an existing
(pre-this-change) single-category JSA for editing and confirm it loads with its one category
pre-checked.
