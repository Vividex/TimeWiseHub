# In-App SWMS/JSA Document Reader Page — Design Spec

## Problem

SWMS/JSA documents have no in-app viewing page. "View" opens the raw
`@react-pdf/renderer` output (`/api/projects/[projectId]/swms/[documentId]/pdf`)
directly in a new tab (authored docs) or a Supabase Storage signed URL (uploaded
docs). This has two real, user-reported consequences:

1. **Dashboard → project page, not the document.** The "Today" widget's
   awaiting-signature items and the push notification both link to the whole
   project page (`/dashboard/clients/[id]/projects/[projectId]`). The Safety
   panel renders last on that page, so the document a user was told to sign is
   "all the way down the bottom."
2. **PDF-only viewing has no fallback.** The entire authored-document viewing
   path is one `NextResponse` from a react-pdf render. When that route throws
   (as it did — the em-dash `Content-Disposition` bug, already fixed in
   `91d6dda`), View breaks completely with a generic "page not available," with
   no HTML fallback to fall back to.

Investigation confirmed the invoices/quotes module already solves both problems
with a working, shipped pattern: `/dashboard/invoices/[id]/page.tsx` is a real
in-app HTML detail page (primary view), `/dashboard/invoices/[id]/print/page.tsx`
is a separate print-styled route, and the react-pdf component
(`InvoiceDocument.tsx`) is wired to exactly one consumer — a download-only
`/api/invoices/[id]/pdf` route reached via a "Print / PDF" link. This spec
applies that same pattern to SWMS/JSA.

## Goal

A new in-app page that:
- Renders an authored SWMS/JSA document's content as real HTML (or an uploaded
  document's file inline), reachable directly from the Dashboard and push
  notifications.
- Lets an eligible crew member acknowledge/sign at the bottom of the same page.
- Gives managers Edit/Delete actions without navigating back to the project
  page first, and a "Download PDF" link as a secondary artifact — matching the
  invoice page's header pattern exactly.

## Route

`src/app/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]/page.tsx`
— a server component. Coexists with the existing `swms/new` route without
conflict (Next.js matches the static `new` segment before the dynamic
`[documentId]` one).

## Data & access

RLS-scoped read on `project_swms_documents` using the requester's own session,
exactly like the PDF route already does — if the query returns nothing, the
user isn't entitled: `notFound()`. Also fetch, in parallel with the existing
project-page pattern (`src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`
lines 64–130):
- `project_swms_acknowledgments` for this document, to compute ack count and
  whether the current user has already signed.
- The current user's role (`organisation_members`) to compute `canManage`
  (owner/admin/manager — reuse the project page's `canManageConfidential` logic).
- The current user's `profiles.signature_path` (`hasSignature`).
- Whether the current user is on `project_members` for this project
  (`isCrewMember`) or signed in today via `site_sign_ins` (`hasSignedInToday`) —
  the existing eligibility rule for who can acknowledge.
- For authored docs: acknowledger names + signature images, via the service
  client, same as the PDF route (`profiles.signature_path` →
  `storage.from('signatures').download(...)` → base64 data URI).
- For uploaded docs: a signed URL for the stored file, generated server-side via
  the service client (`storage.from('project-swms').createSignedUrl(...)`) —
  no client round-trip needed since this is a server component. Used for an
  "Open document" link, not an inline embed (see Rendering below).

## Rendering

**Authored docs:** render `content` (`SwmsAuthoredContent`) as HTML, reusing the
same category-grouped-rows structure `SwmsDocumentPdf.tsx` already implements
(lines 138–160: per-JSA-category groups + an "Additional Steps" group for
untagged rows; a flat table for SWMS) — as JSX/Tailwind instead of react-pdf
primitives. Sections, in order: title + category label, meta (project name,
supervisor, prepared by, date), JSA-only meta (who's at risk / equipment /
emergency procedures, when present), Job Steps (grouped), PPE chips,
Consultation (names consulted in drafting), Acknowledgments (name + signature
image + timestamp per crew member who has signed).

**Uploaded docs:** no inline embed — Android WebView (the Tauri Android build)
generally has no built-in PDF renderer, so an `<iframe src={signedUrl}>` risks
rendering blank there. Instead, the page shows the document name plus an
"Open document" link/button using the server-generated signed URL (same
new-tab behavior as today's `handleView()`, just reached via this page instead
of the project list). Same page chrome (title, category if set, acknowledgment
count) wraps it; no structured content to render, so the JSA/SWMS section
layout above doesn't apply.

Both cases share the same page chrome and the same Sign section at the bottom.

## Header actions

Mirrors the invoice page's Edit/Print/Actions row:
- **← Back to project** link → `/dashboard/clients/[id]/projects/[projectId]`
- **Edit** (canManage + authored only) → existing
  `swms/new?documentId={id}` route, unchanged
- **Delete** (canManage only) → existing `ConfirmDialog` + delete flow
  (storage remove + row delete), transplanted from `ProjectSwmsPanel.tsx`;
  redirects to the project page afterward since the document page would 404
  once its row is gone
- **Download PDF** (authored only) → `/api/projects/[projectId]/swms/[documentId]/pdf`
  (the already-fixed route). Not shown for uploaded docs — the iframe already
  is the file, there's no separate PDF to generate.

## Sign section (bottom of page)

Transplanted from `ProjectSwmsPanel.tsx`'s existing inline acknowledge block
(lines 172–203): "I've read and understood this" button → if no saved
signature, `SignaturePad` prompt → save signature to profile → insert
`project_swms_acknowledgments` row → show "✓ Acknowledged" state. Same
eligibility rule as today (`isCrewMember || hasSignedInToday`).

**Behavior change to `ProjectSwmsPanel.tsx`:** its inline acknowledge button
(and the `SignaturePad` prompt it triggers) is removed from the list. The list
becomes read-only status — name, category label, `X of Y crew acknowledged`
(canManage only), View, Edit (canManage + authored), Delete (canManage) — with
signing only available on the new document page. This is a deliberate change
to consolidate acknowledging into one code path instead of two, per the
original bug report's ask ("clicking it ... should take you directly to the
... file with the ability to sign down the bottom of that").

`handleView()` changes from `window.open(...)` / signed-URL-in-new-tab to
`router.push()` to the new page for both authored and uploaded docs.

## Call-sites updated to point at the new page

All three currently link to the whole project page; all three change to
`/dashboard/clients/{clientId}/projects/{projectId}/swms/{documentId}`:

1. `src/components/dashboard/DashboardUpcoming.tsx` — the
   `swmsAwaitingSignature.map(...)` `Link` (~line 380).
2. `src/lib/swms-notifications.ts` — `notifySwmsAwaitingSignature()`'s `url`
   (line 35).
3. `src/components/projects/ProjectSwmsPanel.tsx` — `handleView()` (line 68).

## Error handling

- Document not found, or RLS denies access → `notFound()` (matches the invoice
  page's pattern).
- Authored doc with no `content` (shouldn't happen — matches the PDF route's
  existing guard at line 29) → treated the same as not-found rather than a
  blank render.
- Uploaded doc whose signed URL fails to generate → render the page chrome with
  an inline error message in place of the "Open document" link, rather than a
  hard crash.

## Non-goals

- No changes to SWMS's single-category authoring flow (unaffected by this
  work — only JSA has categories to group by).
- No offline caching or print-specific route (`/print`) — "Download PDF"
  covers the export/print use case, same as it does for uploaded docs today.
- No changes to how documents are uploaded or built (`swms/new` route
  untouched).

## Testing / verification

No test runner in this repo — verify via `pnpm run build` (must pass clean)
plus manual smoke:
- Authored single-category SWMS: open from Dashboard widget, confirm content
  renders, sign, confirm ack count updates, Download PDF works.
- Authored multi-category JSA: confirm rows group by category correctly on the
  page (same grouping as the PDF).
- Uploaded PDF: confirm "Open document" opens the file in a new tab and the
  document can still be signed from this page.
- Two-account check: crew member (sign-only, no Edit/Delete/Download) vs.
  manager (full header actions) on the same document.
- Delete from the document page redirects to the project page.
- Click through from Dashboard widget and from a test push notification land
  directly on the document, not the project page.
