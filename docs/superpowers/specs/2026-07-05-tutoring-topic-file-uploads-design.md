# Tutoring: Topic File Uploads (fifth deep-dive feature for the Tutoring workspace profile)

## Background

The year-group/subject/topic structure just shipped gives topics somewhere real to attach course
material to (the user's original IXL-inspired idea, deferred from that phase). This phase builds
the deferred half: letting a tutor upload/attach files, links, or notes to a specific topic, and
browse them from a new dedicated page.

This app already has a mature file-upload system for **Programs** (`program_assets`: pdf/docx/xlsx/
image/video/audio/note/link, with AI summarization for images/PDFs via a paid Claude Haiku call,
storage in a private `program-assets` bucket with signed-URL reads). This phase reuses that same
storage/upload *pattern* — private bucket, permissive storage-layer policies, real authorization
enforced at the Postgres table RLS + API route level, signed URLs for reads — but as a new,
smaller `topic_assets` table, not a reuse of `program_assets` itself, since a topic and a program
are different concepts in this app.

## Scope for this phase

- **No AI summarization.** Files are stored and displayed only — no Claude API calls, no
  additional ongoing cost. Confirmed explicitly; can be added later if it proves useful.
- **File types:** PDF, Word (docx), Excel (xlsx), images — same detectable MIME types as Programs
  minus video/audio (less likely for course material) — plus a plain-text **note** and an
  **external link** (e.g. a YouTube video or website), matching Programs' JSON-body asset types.
- **New page** (`/dashboard/subjects`): a subjects → topics browser, org-scoped (or solo-pro
  scoped), showing each topic's file count and a list/upload UI. Scoped to **file management
  only** — renaming, archiving, or deleting subjects/topics themselves stays out of this pass
  (they're still only created inline during session booking, as already shipped).
- **Any org member can upload/manage files** — matches how any org member can already create a
  subject/topic while booking. RLS mirrors the `subjects`/`topics` tables' own shape exactly:
  org members view all, admins manage all, creator manages their own regardless of role.
- **Nav:** "Subjects" added to the sidebar (`Delivery` group, next to Programs). This is the first
  real content for Phase 4's `NavOverrides` mechanism (built inert, with a note that no real
  per-profile hide/reorder signal existed yet) — every non-tutoring profile gets
  `hiddenHrefs: ['/dashboard/subjects']` added to its config; tutoring gets no override, so it
  shows.

## Out of scope (explicitly deferred)

- AI summarization of uploaded files — separate future consideration, real ongoing cost, needs its
  own approval.
- Video/audio asset types — not core to "course material," can be added later if requested.
- Editing subjects/topics themselves (rename, archive/delete, merge duplicates) from the new page —
  this pass is upload/view/delete-a-file only.
- Any change to how subjects/topics are *created* (still exclusively inline during session
  booking, from the prior phase) — this phase only adds a place to attach files to ones that
  already exist.

## Architecture

### Storage (`topic-assets` bucket)

New private bucket, mirroring `program-assets` exactly: permissive at the storage layer
(`bucket_id = 'topic-assets'`, any authenticated user), with real access control enforced by the
`topic_assets` table's RLS and the API route — not by storage-layer folder scoping. Reads go
through short-lived signed URLs generated server-side (service client), never direct public URLs.

### Schema (`supabase/schema-089-tutoring-topic-assets.sql`)

```sql
insert into storage.buckets (id, name, public) values ('topic-assets', 'topic-assets', false);

create policy "topic-assets: authenticated upload" on storage.objects for insert
  with check (bucket_id = 'topic-assets');
create policy "topic-assets: authenticated read" on storage.objects for select
  using (bucket_id = 'topic-assets');
create policy "topic-assets: authenticated delete" on storage.objects for delete
  using (bucket_id = 'topic-assets');

create type public.topic_asset_type as enum ('pdf', 'docx', 'xlsx', 'image', 'link', 'note');

create table public.topic_assets (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics on delete cascade,
  created_by uuid not null references public.profiles on delete cascade,
  name text not null,
  asset_type public.topic_asset_type not null,
  storage_path text,
  file_size_bytes bigint,
  mime_type text,
  external_url text,
  note_content text,
  created_at timestamptz not null default now()
);

alter table public.topic_assets enable row level security;

create policy "Org members can view topic assets" on public.topic_assets for select
  using (exists (
    select 1 from public.topics t
    join public.subjects s on s.id = t.subject_id
    join public.organisation_members om on om.org_id = s.org_id
    where t.id = topic_assets.topic_id and om.user_id = auth.uid()
  ));

create policy "Org admins can manage topic assets" on public.topic_assets for all
  using (exists (
    select 1 from public.topics t
    join public.subjects s on s.id = t.subject_id
    join public.organisation_members om on om.org_id = s.org_id
    where t.id = topic_assets.topic_id and om.user_id = auth.uid() and om.role in ('owner','admin')
  ));

create policy "Creator can manage own topic assets" on public.topic_assets for all
  using (created_by = auth.uid());
```

For a solo Pro (`subjects.org_id is null`), the org-scoped policies simply match no rows (identical
to how `subjects`/`topics` themselves already behave) — the "Creator can manage own" policy alone
gives full CRUD, same established pattern.

### Storage helper (`src/lib/tutoring/topic-storage.ts`, new)

Mirrors `src/lib/program-storage.ts` exactly, renamed for topics:

```typescript
import { createServiceClient } from '@/lib/supabase-service'

export function topicStoragePath(opts: {
  orgId: string | null
  userId: string
  topicId: string
  assetId: string
  filename: string
}): string {
  const prefix = opts.orgId ? opts.orgId : `solo/${opts.userId}`
  return `${prefix}/${opts.topicId}/${opts.assetId}/${opts.filename}`
}

export async function createTopicAssetSignedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.storage.from('topic-assets').createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl ?? null
}

export async function deleteTopicAssetFile(storagePath: string): Promise<void> {
  const service = createServiceClient()
  await service.storage.from('topic-assets').remove([storagePath])
}
```

### API routes

Like the Programs assets route, these use the **service-role client** for the actual storage
upload/delete + row insert/delete (so a storage failure and a DB failure can be reconciled in
application code, e.g. rolling back an uploaded file if the row insert fails) — which means, same
as Programs, **the table's RLS is bypassed by the service client and cannot be relied on for
authorization here**. Each route does its own explicit access check first, mirroring Programs'
`assertAdminAccess` helper but with this phase's different rule:

```typescript
// src/lib/tutoring/topic-access.ts (new)
import { createServiceClient } from '@/lib/supabase-service'

export async function getTopicAccess(topicId: string, userId: string) {
  const service = createServiceClient()
  const { data: topic } = await service
    .from('topics')
    .select('id, subject_id, subjects(org_id, created_by)')
    .eq('id', topicId)
    .maybeSingle()
  if (!topic) return null
  const subject = (topic.subjects as unknown as { org_id: string | null; created_by: string } | null)
  if (!subject) return null

  if (subject.org_id === null) {
    return subject.created_by === userId ? { isMember: true, isAdmin: true } : null
  }

  const { data: membership } = await service
    .from('organisation_members').select('role').eq('user_id', userId).eq('org_id', subject.org_id).maybeSingle()
  if (!membership) return null
  return { isMember: true, isAdmin: ['owner', 'admin'].includes(membership.role as string) }
}
```

Any org member (`isMember`) may `POST` a new asset (matches this phase's "any org member" upload
decision). `DELETE` requires either the asset's own `created_by === userId` or `isAdmin` — the same
"creator or admin" rule the table's RLS expresses, just re-checked explicitly since the service
client bypasses it.

- **`src/app/api/topics/[id]/assets/route.ts`**: `GET` lists a topic's assets (ordered by
  `created_at`), gated to `isMember`. `POST` handles both `multipart/form-data` (file upload:
  detects pdf/docx/xlsx/image by MIME type, same detection table as Programs minus video/audio,
  50MB default / 10MB image cap matching Programs' limits) and `application/json`
  (`asset_type: 'note'` or `'link'`), gated to `isMember` (not admin-only, a deliberate, confirmed
  deviation from Programs' `assertAdminAccess` precedent).
- **`src/app/api/topics/[id]/assets/[assetId]/route.ts`**: `DELETE` — fetches the asset first to
  get its `created_by`/`storage_path`, checks `created_by === userId || isAdmin`, removes the
  storage file (if any) then the row.
- **`src/app/api/topics/[id]/assets/[assetId]/signed-url/route.ts`**: `GET` — gated to `isMember`,
  returns a `createTopicAssetSignedUrl()` result for file-type assets (403/404 if the asset has no
  `storage_path`, e.g. a note or link).

### New page (`src/app/dashboard/subjects/page.tsx`)

Fetches the caller's org/solo scope (same `organisation_members` lookup pattern already used
elsewhere), queries `subjects` (non-archived, scoped) joined to their `topics` (non-archived), and
for each topic a count of `topic_assets`. Renders a two-level list: subject → topic → file count,
expandable to show/upload/delete files for that topic (multipart file input, a "paste a link"
input, a "add a note" textarea — mirroring the three creation paths the API supports). No
create/rename/archive UI for subjects/topics themselves this pass.

### Navigation

`src/components/nav/SidebarNav.tsx`: add `BookOpen` to the existing `lucide-react` import line, and
add `{ label: 'Subjects', href: '/dashboard/subjects', icon: BookOpen }` to the `Delivery` group,
next to `Programs`.

`src/lib/workspace-profiles/registry.ts`: every profile except `tutoring` gains
`navOverrides: { hiddenHrefs: ['/dashboard/subjects'] }` (nine profiles: `generic`,
`personal_training`, `builder_construction`, `trades_field_services`, `consulting`, `healthcare`,
`real_estate`, `cleaning_maintenance`, `creative_agencies`). `tutoring` gets no `navOverrides`
change, so the item shows by default. This is the first time any profile actually uses
`hiddenHrefs` — Phase 4 shipped the mechanism inert, flagged explicitly as waiting for real signal;
this is that signal.

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `topic-assets` bucket + 3 storage policies exist; `topic_assets`
   table + 3 RLS policies exist.
2. Visit `/dashboard/subjects` on the tutoring test account — confirm subjects/topics from the
   prior phase's testing appear, each topic showing a file count (0 initially).
3. Upload a PDF to a topic, confirm it appears with correct name/size and can be opened via its
   signed URL.
4. Add a note and a link to the same topic, confirm both display correctly (no storage_path, no
   signed-url button for these two).
5. Delete a file, confirm it's removed from both the list and (for file-type assets) the storage
   bucket.
6. Confirm a second, non-admin org member can also upload/delete their own uploads, but not
   someone else's (unless they're an admin).
7. Switch the account to a non-tutoring profile (e.g. `personal_training`), confirm "Subjects"
   disappears from the sidebar; switch back to `tutoring`, confirm it reappears. Confirm this
   matches the pattern already used to verify Phase 3/4's terminology and nav changes.
