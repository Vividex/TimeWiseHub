# Programs Phase 3 — Template Builder

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## What we're building

The real need behind "templates" isn't reuse in general — Phase 4 already covers that (link one
shared Program to many Sessions). It's **independent copies**: stamping out a fresh, isolated
Program that starts with the same category structure every time, so each client/engagement can
fill it in separately without stepping on anyone else's content (e.g. every new client gets an
"Intake Forms / Assessment / Goals" skeleton, but each client's actual documents are their own).

**Phase 3 scope:** mark a Program as a template, browse templates separately from regular
Programs, and clone (duplicate) a program's structure — in either direction — into a brand new,
independent Program.

## Out of scope

- AI summarisation/auto-tagging (Phase 2 — separate, unrelated effort)
- Cloning file-based assets (PDF/image/audio/etc.) — see "Cloning semantics" below
- A distinct "template builder" authoring UI — templates are edited via the existing
  `ProgramExplorer`, unchanged
- Sharing templates across organisations (marketplace-style) — templates stay org/owner-scoped,
  same as regular programs today

---

## Data model

One column, no new tables:

```sql
alter table public.programs
  add column is_template boolean not null default false;
```

`program_categories` and `program_assets` are untouched — a template's categories/assets are
just ordinary rows under a program that happens to be flagged. RLS is unchanged; the existing
owner/org-membership policies on `programs` already cover this column.

---

## Cloning semantics

One new endpoint does all the copying, used in both directions (template → new program, or
program → new template):

### `POST /api/programs/[id]/duplicate`

- **Auth:** caller must have view access to the source program (owner or org member) — the same
  check used to view it in the explorer. Duplicating doesn't mutate the source, so no elevated
  permission is required beyond "can see it."
- **Body:** `{ name: string, is_template: boolean }`
- **Steps:**
  1. Create a new `programs` row: `owner_id` = caller, `org_id` = source's `org_id`, `name` from
     the request, `cover_colour`/`icon` inherited from the source, `is_template` from the request,
     `is_archived: false`.
  2. Deep-copy `program_categories`, walking the tree top-down and remapping each old category id
     to its new id so `parent_id` references stay correct in the copy.
  3. Copy only `program_assets` rows where `asset_type in ('note', 'link')`, attached to the
     corresponding new `category_id` (or left uncategorised if the original was). **File-based
     types (`pdf`, `docx`, `xlsx`, `image`, `audio`, `video`) are skipped entirely** — copying them
     would mean duplicating the underlying Supabase Storage object (extra cost/complexity), and
     naively pointing two `program_assets` rows at the same `storage_path` is unsafe: the existing
     delete route (`DELETE /api/programs/[id]/assets/[assetId]`) removes the storage file when any
     row referencing it is deleted, which would silently break the other copy.
  4. Return the new program.

### `GET /api/programs` — extended

Gains an optional `?is_template=true` query param. With no param, behavior is **unchanged** —
returns `is_template = false` programs only, so every existing caller (the Programs dashboard's
default list, and the Phase 4 session-link picker) is unaffected and never surfaces templates
by accident.

### `POST /api/programs` — extended

Accepts an optional `is_template` boolean in the body (defaults to `false`, matching the column
default) so the "New template" entry point can create one directly.

---

## UI entry points

Three places call the duplicate endpoint; no new authoring screen — a template is edited with
the exact same `ProgramExplorer`/`CategoryTree`/`AssetGrid` components already shipped in Phase 1.

1. **Programs dashboard** (`/dashboard/programs`): a "Programs" / "Templates" tab toggle. The
   Templates tab lists `is_template = true` programs and has its own "New template" button
   (reuses `ProgramForm` with a prop that sets `is_template: true` and swaps the modal's title/copy
   from "New program" to "New template").
2. **Template card → "Use template"**: a button on each template card in the Templates tab opens
   a small naming prompt (single text input, defaulting to the template's name), then calls
   duplicate with `is_template: false` and navigates to the new program's explorer.
3. **Program explorer → "Save as template"**: a header button, visible when `canManage` is true
   and the program isn't already a template, defaulting the name to `${program.name} template`,
   calls duplicate with `is_template: true`, and navigates to the new template's explorer.

---

## Files touched

**New:**
- `supabase/schema-074-program-templates.sql`
- `src/app/api/programs/[id]/duplicate/route.ts`

**Modified:**
- `src/app/api/programs/route.ts` — `GET` gains `is_template` filter; `POST` accepts `is_template`
- `src/app/dashboard/programs/page.tsx` — fetch both regular programs and templates
- `src/components/programs/ProgramsDashboardClient.tsx` — tab toggle, "New template" button,
  "Use template" naming prompt
- `src/components/programs/ProgramForm.tsx` — accept `isTemplate` prop, adjust copy, pass through
  on submit
- `src/components/programs/ProgramExplorer.tsx` — "Save as template" header button
- `src/types/programs.ts` — add `is_template: boolean` to the `Program` type
