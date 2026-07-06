# Subjects Page: Folder Navigation + File Search

## Origin

Raised mid-implementation of the Collaborative Worksheet Annotation feature (see that spec/plan):
the async entry point required drilling through the existing Year Group → Subject → Topic
dropdowns on `/dashboard/subjects` to find one PDF/image to annotate. The user flagged this as
genuinely clumsy at real scale — "a tutor could have potentially thousands of documents and
dozens of clients" — and asked to fix the navigation UX now, before more features build on top of
the dropdown pattern, rather than deferring it.

Two separate ideas were raised and deliberately separated during brainstorming:
1. **Search by name** — confirmed as the actual fix for "finding one document among thousands."
   Neither dropdowns nor folder-clicking solve this; both require already knowing where a file
   lives. Search removes that requirement entirely.
2. **A Windows-Explorer-style folder system with drag-and-drop** — a much larger idea (its own
   `folders` table, drag-and-drop tree UI, and likely conflict with the existing subject/topic
   taxonomy which also drives session booking and lesson tagging). Explicitly **not** what this
   spec builds — see Non-goals.

What this spec actually builds is a middle ground the user proposed directly: keep the exact same
underlying `subjects`/`topics`/`topic_assets` hierarchy and data model, but present it as
clickable folders with real per-level pages instead of three stacked `<select>` dropdowns —  a
pure navigation/presentation change, plus the search feature from point 1 above.

## Confirmed requirements

- Real per-level routes (not client-side dropdown state) so browser back/forward and bookmarking
  work naturally, each level its own page with a breadcrumb.
- A persistent, general-purpose search box (not scoped only to "find something to annotate") —
  results show any matching file by name, from any folder depth, with whatever actions that file
  type supports (View, Annotate if pdf/image, Delete) — same actions available as browsing there
  directly.
- Fast — folder-to-folder navigation must feel instant, no long loading between levels. This is
  achievable without new infrastructure: every query here already has a supporting index
  (`topics_subject_year`, existing `subjects`/`topic_assets` FK indexes) and each level fetches a
  short list (year groups, an org's subjects, one subject+year's topics, one topic's files) —
  nothing here is a large-table scan.
- No schema change of any kind — `subjects`, `topics`, `topic_assets`, and all their RLS policies
  are completely untouched. This is a presentation-layer change only.

## Routes

- `/dashboard/subjects` — Year Group folders (the fixed `YEAR_GROUPS` constant, unchanged from
  today's dropdown — every year group always shown, matching current behavior of not
  pre-filtering by data existence). Search box lives here and persists across all levels below.
- `/dashboard/subjects/[yearGroup]` — Subject folders (the org's full `subjects` list — subjects
  are not year-scoped themselves, only topics are, matching today's dropdown behavior where the
  subject list doesn't change based on the selected year group).
- `/dashboard/subjects/[yearGroup]/[subjectId]` — Topic folders (`topics` where `subject_id` and
  `year_group` match — the same query `SubjectsBrowser` already runs, just rendered as a route
  instead of populating a third dropdown).
- `/dashboard/subjects/[yearGroup]/[subjectId]/[topicId]` — the file list. Same content and
  actions as today's `TopicAssetsPanel` (view/upload/add link/add note/delete, plus the Annotate
  action from the worksheet-annotation feature) — this component is reused as-is, just reached by
  a URL instead of conditional rendering under three dropdowns.

Each route level shows a breadcrumb (e.g. "Subjects › Year 8 › Mathematics") linking back to any
ancestor level, in addition to the browser's native back button working correctly since these are
real navigations.

## Search

A single search input, visible on `/dashboard/subjects` and persisting (e.g. in a shared layout)
across every folder level beneath it. Queries `topic_assets.name` (case-insensitive partial match)
joined through `topics → subjects`, filtered to the caller's own org (or solo-pro scope) at the
`subjects` level — the same org/solo branching `getTopicAccess()` already applies to one topic at
a time, just applied across every topic at once rather than a single `topicId`. No new RLS; this
is the identical access boundary, checked more broadly.

Each result row shows:
- The file name and type icon (matching today's `TopicAssetsPanel` icon treatment)
- A breadcrumb of where it lives (Year Group · Subject · Topic), resolved via the same join
  `topic_assets → topics → subjects` already used by `getTopicAccess()`
- The same actions available when browsing there directly: View (signed URL), Annotate (if
  `pdf`/`image`), Delete

Search results replace the folder-tile view while a query is active; clearing the search returns
to normal folder browsing at whatever level you were on.

## Non-goals (explicit)

- **No drag-and-drop.** Folders here are a read-only visual presentation of the existing fixed
  hierarchy, not a mutable file system. Moving a file between topics is still not possible from
  this UI (same limitation as today).
- **No new folder creation from this UI.** Subjects/topics are still only created inline during
  session booking, unchanged from today.
- **No standalone/non-curriculum "assets" area** (e.g. for org logos or documents outside the
  syllabus structure) — raised by the user as a real future want, explicitly deferred, not
  designed here. Would need its own data model (a folder concept genuinely independent of
  subject/topic) and its own brainstorm.
- **No change to the in-call worksheet picker** (`WorksheetTab`, part of the Collaborative
  Worksheet Annotation plan's C-6, not yet built) — that picker is naturally already scoped to one
  session's own topic and doesn't have the findability problem this spec addresses.
- **Multi-file drag-and-drop upload** — raised as a future want, explicitly deferred alongside the
  general drag-and-drop idea above.

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test runner).
- Manual smoke: navigate all four route levels via folder clicks, confirm breadcrumbs and the
  browser back button both work correctly at each level. Search for a file by partial name from
  the top level and from a nested folder level, confirm results show the correct breadcrumb and
  that View/Annotate/Delete all work identically to browsing there directly. Confirm a solo Pro
  (no org) and an org member each only see their own scope's files in search results, matching
  today's existing access boundary. Confirm folder-to-folder navigation feels fast (no visible
  loading delay beyond normal page navigation).
