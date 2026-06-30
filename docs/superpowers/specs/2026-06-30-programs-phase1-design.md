# Programs Phase 1 — Design Spec

**Date:** 2026-06-30  
**Status:** Approved for implementation

---

## What we're building

Programs are reusable structured content containers. Users organise intellectual property — files, notes, links — into nested categories and later attach Programs to Sessions. Designed for any industry: coaches, consultants, NDIS providers, HR teams, personal trainers, educators.

**Phase 1 scope:** database + storage + sidebar nav + programs dashboard + file explorer (create programs, manage categories, upload assets). Nothing else.

---

## Out of scope for Phase 1

- AI summarisation / auto-categorisation → Phase 2
- Template builder → Phase 3
- Session preparation tab + program linking → Phase 4

---

## Data model

### `programs`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid nullable → organisations | null for solo users |
| owner_id | uuid → profiles | creator |
| name | text | |
| description | text nullable | |
| cover_colour | text | hex, default `#06b6d4` |
| icon | text | lucide icon name, default `'library'` |
| is_archived | boolean | soft delete |
| created_at / updated_at | timestamptz | |

### `program_categories`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| program_id | uuid → programs CASCADE | |
| parent_id | uuid nullable → program_categories CASCADE | self-referential |
| name | text | |
| description | text nullable | |
| colour | text nullable | |
| icon | text nullable | |
| sort_order | integer | |
| created_at | timestamptz | |

**Depth cap:** max 3 levels, enforced at API layer (not DB constraint).  
**On delete:** deleting a category cascades deletion to child categories; assets in the deleted category have `category_id` set to null (uncategorised).

### `program_assets`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| program_id | uuid → programs CASCADE | |
| category_id | uuid nullable → program_categories SET NULL | |
| owner_id | uuid nullable → profiles SET NULL | |
| name | text | |
| description | text nullable | |
| asset_type | enum | pdf, docx, xlsx, image, video, audio, note, link |
| storage_path | text nullable | Supabase Storage path; null for note/link types |
| file_size_bytes | bigint nullable | |
| mime_type | text nullable | |
| external_url | text nullable | for video + link types |
| note_content | text nullable | for note type (inline text, no file) |
| ai_status | enum | skipped (Phase 1), pending/processing/done/failed (Phase 2) |
| ai_summary | text nullable | Phase 2 |
| ai_tags | text[] | Phase 2 |
| sort_order | integer | |
| metadata | jsonb | extensible |
| created_at / updated_at | timestamptz | |

---

## Storage

- **Bucket:** `program-assets` (private, no public access)
- **Path for org users:** `{org_id}/{program_id}/{asset_id}/{original_filename}`
- **Path for solo users:** `solo/{owner_id}/{program_id}/{asset_id}/{original_filename}`
- **Signed URLs:** 1-hour expiry, generated server-side on page load
- **File types allowed:** pdf, docx, xlsx, png, jpg, gif, webp, mp3, wav, m4a (no video upload — link-only)
- **Size caps:** images 10MB, documents 50MB, audio 100MB — enforced in upload API

---

## Key decisions

**Video = link-only.** Users paste YouTube/Vimeo/Loom URLs stored in `external_url`. No direct video upload (avoids egress costs and transcoding complexity).

**Category depth cap = 3.** API returns 422 if the parent category is already at depth 2. UI disables "Add subcategory" button at depth 3 so the cap is invisible to the user.

**ai_status defaults to `'skipped'`** in Phase 1. The column is ready for Phase 2 without a migration.

**Signed URLs at page load.** Server component generates signed URLs for all assets when rendering the explorer. Simple for Phase 1; optimise to on-demand if performance becomes an issue.

**Program creation = inline modal.** No `/new` sub-route. Modal opens from the dashboard "New program" button.

---

## RLS pattern

`programs`: SELECT for org members OR owner; ALL for org admins/managers OR owner.

`program_categories` / `program_assets`: SELECT / ALL scoped through a subquery on `programs` (join through parent table). Avoids denormalising `org_id` into every child table.

---

## Routing

| Route | Component | Purpose |
|---|---|---|
| `/dashboard/programs` | server page | Dashboard — list all programs |
| `/dashboard/programs/[id]` | server page + `ProgramExplorer` client | File explorer for one program |

---

## UI components

| Component | Type | Responsibility |
|---|---|---|
| `src/components/programs/ProgramExplorer.tsx` | client | Split-pane shell, manages `selectedCategoryId` state |
| `src/components/programs/CategoryTree.tsx` | client | Left panel — nested category nav, add/rename/delete |
| `src/components/programs/AssetGrid.tsx` | client | Right panel — filtered asset grid |
| `src/components/programs/AssetCard.tsx` | client | Individual asset tile — icon, name, kebab menu |
| `src/components/programs/AssetUploadZone.tsx` | client | Drag-drop overlay + note/link form |
| `src/components/programs/CategoryForm.tsx` | client | Modal — create/edit category |
| `src/components/programs/ProgramForm.tsx` | client | Modal — create/edit program |
| `src/types/programs.ts` | types | Shared TypeScript types |
| `src/lib/program-storage.ts` | lib | `createProgramAssetSignedUrl()` helper |
