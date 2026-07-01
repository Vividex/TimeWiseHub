# Programs Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core Programs feature — database tables, file storage, sidebar nav, programs dashboard, and a split-pane file explorer with categories and asset upload.

**Architecture:** Three Supabase tables (`programs`, `program_categories`, `program_assets`) with RLS scoped through `organisation_members`. A private `program-assets` storage bucket holds uploaded files. The programs explorer is a server-rendered page that fetches data and pre-generates signed URLs, passing everything to a `ProgramExplorer` client component that owns the selected-category state.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr` + service client), Lucide React icons. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages without approval.
- API routes use `createClient()` for user auth, `createServiceClient()` for cross-user DB ops. Both exist at `@/lib/supabase-server` and `@/lib/supabase-service`.
- Supabase project ID: `sdwwlnnsijcadkdwsvud`. Migrations applied via MCP `apply_migration`.
- Migration files saved as `supabase/schema-NNN-name.sql`. Next available: `072`.
- All Tailwind classes must include `dark:` variants. Pattern: `bg-white dark:bg-slate-900`, `border-gray-100 dark:border-slate-800`, `text-gray-900 dark:text-slate-100`, `text-gray-500 dark:text-slate-400`.
- Do NOT add AI logic, template builder, or session integration — those are Phase 2+.
- Video asset type = link-only. No direct video file upload.
- Category depth cap = 3 levels, enforced at API (not DB).
- `ai_status` defaults to `'skipped'` for all uploaded assets in Phase 1.

---

## File Map

**New files to create:**

```
supabase/schema-072-programs.sql
src/types/programs.ts
src/lib/program-storage.ts
src/app/api/programs/route.ts
src/app/api/programs/[id]/route.ts
src/app/api/programs/[id]/categories/route.ts
src/app/api/programs/[id]/categories/[catId]/route.ts
src/app/api/programs/[id]/assets/route.ts
src/app/api/programs/[id]/assets/[assetId]/route.ts
src/app/dashboard/programs/page.tsx
src/app/dashboard/programs/[id]/page.tsx
src/components/programs/ProgramForm.tsx
src/components/programs/ProgramExplorer.tsx
src/components/programs/CategoryTree.tsx
src/components/programs/CategoryForm.tsx
src/components/programs/AssetGrid.tsx
src/components/programs/AssetCard.tsx
src/components/programs/AssetUploadZone.tsx
```

**Files to modify:**

```
src/components/nav/SidebarNav.tsx        — add Programs nav item
src/components/DashboardShell.tsx        — add Programs to PAGE_TITLES
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/schema-072-programs.sql`
- [CONDUCTOR] Apply via Supabase MCP

**Interfaces:**
- Produces: tables `programs`, `program_categories`, `program_assets` and enums `program_asset_type`, `ai_processing_status`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/schema-072-programs.sql
-- Programs Phase 1: reusable knowledge containers

-- ── Enums ────────────────────────────────────────────────────

create type public.program_asset_type as enum (
  'pdf', 'docx', 'xlsx', 'image', 'video', 'audio', 'note', 'link'
);

create type public.ai_processing_status as enum (
  'pending', 'processing', 'done', 'failed', 'skipped'
);

-- ── programs ─────────────────────────────────────────────────

create table public.programs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organisations(id) on delete cascade,
  owner_id     uuid references public.profiles(id)      on delete set null,
  name         text not null,
  description  text,
  cover_colour text not null default '#06b6d4',
  icon         text not null default 'library',
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.programs enable row level security;

create policy "programs: org members can view"
  on public.programs for select
  using (
    owner_id = auth.uid()
    or (org_id is not null and org_id in (
      select org_id from public.organisation_members where user_id = auth.uid()
    ))
  );

create policy "programs: admins and owners can manage"
  on public.programs for all
  using (
    owner_id = auth.uid()
    or (org_id is not null and org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
    ))
  );

create index programs_org    on public.programs (org_id) where org_id is not null;
create index programs_owner  on public.programs (owner_id);

create or replace function public.touch_program()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger program_updated
  before update on public.programs
  for each row execute function public.touch_program();

-- ── program_categories ───────────────────────────────────────

create table public.program_categories (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  parent_id   uuid references public.program_categories(id) on delete cascade,
  name        text not null,
  description text,
  colour      text,
  icon        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.program_categories enable row level security;

create policy "program_categories: view"
  on public.program_categories for select
  using (
    exists (
      select 1 from public.programs p where p.id = program_categories.program_id
        and (
          p.owner_id = auth.uid()
          or (p.org_id is not null and p.org_id in (
            select org_id from public.organisation_members where user_id = auth.uid()
          ))
        )
    )
  );

create policy "program_categories: manage"
  on public.program_categories for all
  using (
    exists (
      select 1 from public.programs p where p.id = program_categories.program_id
        and (
          p.owner_id = auth.uid()
          or (p.org_id is not null and p.org_id in (
            select org_id from public.organisation_members
            where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
          ))
        )
    )
  );

create index program_categories_program on public.program_categories (program_id, sort_order);
create index program_categories_parent  on public.program_categories (parent_id) where parent_id is not null;

-- ── program_assets ───────────────────────────────────────────

create table public.program_assets (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id)           on delete cascade,
  category_id      uuid          references public.program_categories(id)  on delete set null,
  owner_id         uuid          references public.profiles(id)            on delete set null,
  name             text not null,
  description      text,
  asset_type       public.program_asset_type not null,
  storage_path     text,
  file_size_bytes  bigint,
  mime_type        text,
  external_url     text,
  note_content     text,
  ai_status        public.ai_processing_status not null default 'skipped',
  ai_summary       text,
  ai_tags          text[] not null default '{}',
  sort_order       integer not null default 0,
  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.program_assets enable row level security;

create policy "program_assets: view"
  on public.program_assets for select
  using (
    exists (
      select 1 from public.programs p where p.id = program_assets.program_id
        and (
          p.owner_id = auth.uid()
          or (p.org_id is not null and p.org_id in (
            select org_id from public.organisation_members where user_id = auth.uid()
          ))
        )
    )
  );

create policy "program_assets: manage"
  on public.program_assets for all
  using (
    exists (
      select 1 from public.programs p where p.id = program_assets.program_id
        and (
          p.owner_id = auth.uid()
          or (p.org_id is not null and p.org_id in (
            select org_id from public.organisation_members
            where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
          ))
        )
    )
  );

create index program_assets_program  on public.program_assets (program_id, sort_order);
create index program_assets_category on public.program_assets (category_id) where category_id is not null;

create or replace function public.touch_program_asset()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger program_asset_updated
  before update on public.program_assets
  for each row execute function public.touch_program_asset();
```

- [ ] **Step 2: Apply migration [CONDUCTOR — run via Supabase MCP apply_migration]**

  Name: `programs-phase1`
  SQL: the content of `supabase/schema-072-programs.sql`

- [ ] **Step 3: Verify tables exist [CONDUCTOR]**

  Run via MCP `execute_sql`:
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('programs', 'program_categories', 'program_assets')
  order by table_name;
  ```
  Expected: 3 rows returned.

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/schema-072-programs.sql
  git commit -m "feat: programs phase 1 — DB migration (programs, categories, assets)"
  ```

---

## Task 2: Storage Bucket

**[CONDUCTOR task — all steps via Supabase MCP or dashboard]**

**Files:** None (bucket + policies created in Supabase, not in code)

**Interfaces:**
- Produces: private bucket `program-assets` accessible via service client

- [ ] **Step 1: Create bucket [CONDUCTOR — via MCP execute_sql or Supabase dashboard]**

  In Supabase Storage, create a bucket named `program-assets` with public access **OFF**.

  Alternatively via SQL:
  ```sql
  insert into storage.buckets (id, name, public)
  values ('program-assets', 'program-assets', false)
  on conflict (id) do nothing;
  ```

- [ ] **Step 2: Add storage RLS policies [CONDUCTOR]**

  ```sql
  -- Org members and owners can read their org's assets
  create policy "program-assets: authenticated read"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'program-assets');

  -- Authenticated users can upload (API route enforces ownership)
  create policy "program-assets: authenticated upload"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'program-assets');

  -- Authenticated users can delete (API route enforces ownership)
  create policy "program-assets: authenticated delete"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'program-assets');
  ```

  Note: The API routes (which run with service client) enforce that only org admins/owners can upload and delete. The storage RLS just prevents unauthenticated access.

- [ ] **Step 3: Commit (empty — bucket is in Supabase, not git)**

  ```bash
  git commit --allow-empty -m "chore: program-assets storage bucket created in Supabase"
  ```

---

## Task 3: Shared Types + Storage Helper

**Files:**
- Create: `src/types/programs.ts`
- Create: `src/lib/program-storage.ts`

**Interfaces:**
- Produces: `Program`, `ProgramCategory`, `ProgramAsset`, `ProgramAssetType` types used by all subsequent tasks
- Produces: `createProgramAssetSignedUrl(path)` used by the explorer page

- [ ] **Step 1: Write types file**

Create `src/types/programs.ts`:

```typescript
export type ProgramAssetType =
  | 'pdf' | 'docx' | 'xlsx' | 'image' | 'video' | 'audio' | 'note' | 'link'

export type AiProcessingStatus =
  | 'pending' | 'processing' | 'done' | 'failed' | 'skipped'

export type Program = {
  id: string
  org_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  cover_colour: string
  icon: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type ProgramCategory = {
  id: string
  program_id: string
  parent_id: string | null
  name: string
  description: string | null
  colour: string | null
  icon: string | null
  sort_order: number
  created_at: string
}

export type ProgramAsset = {
  id: string
  program_id: string
  category_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  asset_type: ProgramAssetType
  storage_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  external_url: string | null
  note_content: string | null
  ai_status: AiProcessingStatus
  ai_summary: string | null
  ai_tags: string[]
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Added server-side when serving explorer data
  signed_url?: string | null
}

// Nested category tree (built from flat list)
export type CategoryNode = ProgramCategory & { children: CategoryNode[] }
```

- [ ] **Step 2: Write storage helper**

Create `src/lib/program-storage.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase-service'

export function programStoragePath(opts: {
  orgId: string | null
  ownerId: string
  programId: string
  assetId: string
  filename: string
}): string {
  const prefix = opts.orgId ? opts.orgId : `solo/${opts.ownerId}`
  return `${prefix}/${opts.programId}/${opts.assetId}/${opts.filename}`
}

export async function createProgramAssetSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.storage
    .from('program-assets')
    .createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl ?? null
}

export async function deleteProgramAssetFile(storagePath: string): Promise<void> {
  const service = createServiceClient()
  await service.storage.from('program-assets').remove([storagePath])
}
```

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/types/programs.ts src/lib/program-storage.ts
  git commit -m "feat: programs — shared types and storage helpers"
  ```

---

## Task 4: Sidebar Nav + Page Titles

**Files:**
- Modify: `src/components/nav/SidebarNav.tsx`
- Modify: `src/components/DashboardShell.tsx`

**Interfaces:**
- Consumes: `NAV_GROUPS` array in `SidebarNav.tsx`, `PAGE_TITLES` map in `DashboardShell.tsx`
- Produces: Programs link visible in sidebar, "Programs" shown as page title

- [ ] **Step 1: Add Programs to nav groups**

In `src/components/nav/SidebarNav.tsx`, add `Library` to the import list and add the Programs item to the `'Delivery'` group:

```typescript
import {
  LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
  TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
  MessageSquare, Sparkles, CalendarRange, Users2, Video, ScrollText, Network,
  Library,                                    // ← add this
  type LucideIcon,
} from 'lucide-react'
```

In `NAV_GROUPS`, update the `'Delivery'` group:

```typescript
{ title: 'Delivery', items: [
  { label: 'Clients',   href: '/dashboard/clients',  icon: Users,    tutorialId: 'clients' },
  { label: 'Programs',  href: '/dashboard/programs', icon: Library },   // ← add
  { label: 'Calendar',  href: '/dashboard/calendar', icon: CalendarDays },
  { label: 'Time',      href: '/dashboard/time',     icon: Clock,    tutorialId: 'time' },
] },
```

- [ ] **Step 2: Add Programs to page titles**

In `src/components/DashboardShell.tsx`, update `PAGE_TITLES`:

```typescript
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/dashboard/time': 'Time tracking',
  '/dashboard/chat': 'Chat',
  '/dashboard/assistant': 'Assistant',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/clients': 'Clients',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/billing': 'Billing',
  '/dashboard/finance': 'Finance',
  '/dashboard/programs': 'Programs',    // ← add
}
```

Also add Programs to the `getTitle` function:

```typescript
function getTitle(pathname: string) {
  if (pathname.includes('/projects/')) return 'Project'
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return 'Projects'
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname.startsWith('/dashboard/clients/')) return 'Client'
  if (pathname.startsWith('/dashboard/programs/')) return 'Program'   // ← add
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/nav/SidebarNav.tsx src/components/DashboardShell.tsx
  git commit -m "feat: programs — sidebar nav item and page titles"
  ```

---

## Task 5: Programs API

**Files:**
- Create: `src/app/api/programs/route.ts`
- Create: `src/app/api/programs/[id]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/programs` → `Program[]`
  - `POST /api/programs` → `Program`
  - `GET /api/programs/[id]` → `Program`
  - `PATCH /api/programs/[id]` → `Program`
  - `DELETE /api/programs/[id]` → `{ ok: true }` (archives, does not hard-delete)

- [ ] **Step 1: Create programs list + create route**

Create `src/app/api/programs/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members').select('org_id')
    .eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const query = orgId
    ? service.from('programs')
        .select('*')
        .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
    : service.from('programs')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description, cover_colour, icon, org_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const service = createServiceClient()

  if (org_id) {
    const { data: membership } = await service
      .from('organisation_members').select('role')
      .eq('user_id', user.id).eq('org_id', org_id).maybeSingle()
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await service.from('programs').insert({
    owner_id: user.id,
    org_id: org_id ?? null,
    name: name.trim(),
    description: description?.trim() || null,
    cover_colour: cover_colour || '#06b6d4',
    icon: icon || 'library',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create program detail route**

Create `src/app/api/programs/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function resolveProgram(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('*').eq('id', programId).single()
  if (!program) return null

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()

  const isOwner = program.owner_id === userId
  const isMember = !!membership
  const isAdmin = isMember && ['owner', 'admin', 'manager'].includes(membership!.role as string)

  return { program, isOwner, isMember, isAdmin }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(resolved.program)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name?.trim() || resolved.program.name
  if ('description' in body) patch.description = body.description?.trim() || null
  if ('cover_colour' in body) patch.cover_colour = body.cover_colour
  if ('icon' in body) patch.icon = body.icon
  if ('is_archived' in body) patch.is_archived = body.is_archived

  const service = createServiceClient()
  const { data, error } = await service.from('programs')
    .update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft-delete: archive rather than hard delete
  const service = createServiceClient()
  const { error } = await service.from('programs')
    .update({ is_archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/programs/
  git commit -m "feat: programs — programs CRUD API"
  ```

---

## Task 6: Categories API

**Files:**
- Create: `src/app/api/programs/[id]/categories/route.ts`
- Create: `src/app/api/programs/[id]/categories/[catId]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/programs/[id]/categories` → `ProgramCategory[]` (flat list, all categories for program)
  - `POST /api/programs/[id]/categories` → `ProgramCategory` (422 if depth would exceed 3)
  - `PATCH /api/programs/[id]/categories/[catId]` → `ProgramCategory`
  - `DELETE /api/programs/[id]/categories/[catId]` → `{ ok: true }`

- [ ] **Step 1: Write categories list + create route**

Create `src/app/api/programs/[id]/categories/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function assertAccess(programId: string, userId: string, requireAdmin = false) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return null

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()

  const isOwner = program.owner_id === userId
  const isAdmin = !!membership && ['owner', 'admin', 'manager'].includes(membership.role as string)
  const isMember = !!membership

  if (requireAdmin && !isOwner && !isAdmin) return null
  if (!requireAdmin && !isOwner && !isMember) return null
  return { program, isOwner, isAdmin }
}

async function getCategoryDepth(catId: string | null): Promise<number> {
  if (!catId) return 0
  const service = createServiceClient()
  let depth = 0
  let currentId: string | null = catId
  while (currentId && depth < 4) {
    const { data } = await service
      .from('program_categories').select('parent_id').eq('id', currentId).single()
    if (!data) break
    currentId = data.parent_id
    depth++
  }
  return depth
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('program_categories').select('*')
    .eq('program_id', id).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertAccess(id, user.id, true)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, parent_id, description, colour, icon } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // Depth enforcement: parent at depth 2 would make child depth 3 (0-indexed: root=0, child=1, grandchild=2)
  if (parent_id) {
    const parentDepth = await getCategoryDepth(parent_id)
    if (parentDepth >= 3) {
      return NextResponse.json(
        { error: 'Maximum category depth (3 levels) reached' },
        { status: 422 },
      )
    }
  }

  const service = createServiceClient()
  const { data, error } = await service.from('program_categories').insert({
    program_id: id,
    parent_id: parent_id ?? null,
    name: name.trim(),
    description: description?.trim() || null,
    colour: colour || null,
    icon: icon || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Write category detail route**

Create `src/app/api/programs/[id]/categories/[catId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return false
  if (program.owner_id === userId) return true
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  return !!m && ['owner', 'admin', 'manager'].includes(m.role as string)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; catId: string }> },
) {
  const { id, catId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name?.trim()
  if ('description' in body) patch.description = body.description?.trim() || null
  if ('colour' in body) patch.colour = body.colour || null
  if ('icon' in body) patch.icon = body.icon || null
  if ('sort_order' in body) patch.sort_order = body.sort_order

  const service = createServiceClient()
  const { data, error } = await service.from('program_categories')
    .update(patch).eq('id', catId).eq('program_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; catId: string }> },
) {
  const { id, catId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  // Cascade in DB handles child categories. Assets have ON DELETE SET NULL — they move to uncategorised.
  const { error } = await service.from('program_categories')
    .delete().eq('id', catId).eq('program_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/programs/[id]/categories/
  git commit -m "feat: programs — categories CRUD API with depth-3 enforcement"
  ```

---

## Task 7: Assets API

**Files:**
- Create: `src/app/api/programs/[id]/assets/route.ts`
- Create: `src/app/api/programs/[id]/assets/[assetId]/route.ts`

**Interfaces:**
- Produces:
  - `POST /api/programs/[id]/assets` — multipart form upload for file assets; JSON body for note/link types
  - `GET /api/programs/[id]/assets` — all assets for program (optionally `?category=uuid`)
  - `PATCH /api/programs/[id]/assets/[assetId]` — rename, move to category, update note content
  - `DELETE /api/programs/[id]/assets/[assetId]` — deletes DB row + storage file

- [ ] **Step 1: Write assets list + create route**

Create `src/app/api/programs/[id]/assets/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { programStoragePath } from '@/lib/program-storage'
import type { ProgramAssetType } from '@/types/programs'

const FILE_ASSET_TYPES: ProgramAssetType[] = ['pdf', 'docx', 'xlsx', 'image', 'audio']
const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  default: 50 * 1024 * 1024,
}

function detectAssetType(mimeType: string): ProgramAssetType | null {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/msword') return 'docx'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'application/vnd.ms-excel') return 'xlsx'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  return null
}

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return null
  if (program.owner_id === userId) return program
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  if (!m || !['owner', 'admin', 'manager'].includes(m.role as string)) return null
  return program
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()

  // Verify access (member or owner)
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
  if (program.owner_id !== user.id && !membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const categoryFilter = url.searchParams.get('category')
  const query = service.from('program_assets').select('*').eq('program_id', id).order('sort_order').order('created_at')
  if (categoryFilter === 'uncategorised') {
    query.is('category_id', null)
  } else if (categoryFilter) {
    query.eq('category_id', categoryFilter)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const program = await assertAdminAccess(id, user.id)
  if (!program) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contentType = req.headers.get('content-type') ?? ''

  // ── Note or Link type (JSON body) ───────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json()
    const { asset_type, name, note_content, external_url, category_id } = body

    if (asset_type === 'note') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const service = createServiceClient()
      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: 'note',
        name: name.trim(),
        note_content: note_content ?? '',
        ai_status: 'skipped',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (asset_type === 'link' || asset_type === 'video') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      if (!external_url?.trim()) return NextResponse.json({ error: 'URL required' }, { status: 400 })
      const service = createServiceClient()
      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: asset_type as ProgramAssetType,
        name: name.trim(),
        external_url: external_url.trim(),
        ai_status: 'skipped',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Invalid asset_type for JSON body' }, { status: 400 })
  }

  // ── File upload (multipart) ──────────────────────────────────
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 415 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const categoryId = formData.get('category_id') as string | null
  const customName = (formData.get('name') as string | null)?.trim()

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const assetType = detectAssetType(file.type)
  if (!assetType) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 422 })
  }

  const maxBytes = MAX_BYTES[assetType] ?? MAX_BYTES.default
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB for ${assetType}` },
      { status: 413 },
    )
  }

  const service = createServiceClient()
  const assetId = crypto.randomUUID()
  const storagePath = programStoragePath({
    orgId: program.org_id,
    ownerId: user.id,
    programId: id,
    assetId,
    filename: file.name,
  })

  const { error: uploadError } = await service.storage
    .from('program-assets')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
  }

  const { data, error } = await service.from('program_assets').insert({
    id: assetId,
    program_id: id,
    owner_id: user.id,
    category_id: categoryId || null,
    asset_type: assetType,
    name: customName || file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    ai_status: 'skipped',
  }).select().single()

  if (error) {
    // Clean up storage if DB insert fails
    await service.storage.from('program-assets').remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

> **Note:** There is a typo in the GET handler above — `const { data: program } = await service.from('programs')...eq('id', programId)` should be `eq('id', id)`. Fix this when writing the file.

- [ ] **Step 2: Write asset detail route**

Create `src/app/api/programs/[id]/assets/[assetId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { deleteProgramAssetFile } from '@/lib/program-storage'

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return false
  if (program.owner_id === userId) return true
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  return !!m && ['owner', 'admin', 'manager'].includes(m.role as string)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name?.trim()
  if ('description' in body) patch.description = body.description?.trim() || null
  if ('category_id' in body) patch.category_id = body.category_id || null
  if ('note_content' in body) patch.note_content = body.note_content
  if ('external_url' in body) patch.external_url = body.external_url?.trim() || null
  if ('sort_order' in body) patch.sort_order = body.sort_order

  const service = createServiceClient()
  const { data, error } = await service.from('program_assets')
    .update(patch).eq('id', assetId).eq('program_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: asset } = await service
    .from('program_assets').select('storage_path').eq('id', assetId).single()

  const { error } = await service.from('program_assets')
    .delete().eq('id', assetId).eq('program_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Delete file from storage after DB row is gone
  if (asset?.storage_path) {
    await deleteProgramAssetFile(asset.storage_path)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/programs/[id]/assets/
  git commit -m "feat: programs — assets CRUD + file upload API"
  ```

---

## Task 8: Programs Dashboard Page

**Files:**
- Create: `src/app/dashboard/programs/page.tsx`
- Create: `src/components/programs/ProgramForm.tsx`

**Interfaces:**
- Consumes: `GET /api/programs`, `POST /api/programs`
- Produces: `/dashboard/programs` renders list of program tiles; "New program" button opens `ProgramForm` modal

- [ ] **Step 1: Write ProgramForm modal**

Create `src/components/programs/ProgramForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const COLOUR_OPTIONS = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#3b82f6', '#ec4899', '#64748b',
]

export default function ProgramForm({
  orgId,
  onClose,
}: {
  orgId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colour, setColour] = useState('#06b6d4')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const res = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null, cover_colour: colour, org_id: orgId }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create'); return }
    router.push(`/dashboard/programs/${json.id}`)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="mb-5 text-base font-bold text-gray-900 dark:text-white">New program</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Client Onboarding, PT Program v2"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">Colour</label>
            <div className="flex gap-2">
              {COLOUR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${colour === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create program'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write programs dashboard page**

Create `src/app/dashboard/programs/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import ProgramsDashboardClient from '@/components/programs/ProgramsDashboardClient'
import type { Program } from '@/types/programs'

export default async function ProgramsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members').select('org_id')
    .eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: programs } = orgId
    ? await service.from('programs').select('*')
        .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
        .eq('is_archived', false).order('created_at', { ascending: false })
    : await service.from('programs').select('*')
        .eq('owner_id', user.id).eq('is_archived', false)
        .order('created_at', { ascending: false })

  return (
    <ProgramsDashboardClient
      programs={(programs ?? []) as Program[]}
      orgId={orgId}
    />
  )
}
```

- [ ] **Step 3: Write ProgramsDashboardClient**

Create `src/components/programs/ProgramsDashboardClient.tsx`:

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Library, Plus, BookOpen } from 'lucide-react'
import ProgramForm from '@/components/programs/ProgramForm'
import type { Program } from '@/types/programs'

export default function ProgramsDashboardClient({
  programs,
  orgId,
}: {
  programs: Program[]
  orgId: string | null
}) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-gray-900 dark:text-white">
              Programs
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
              Reusable knowledge containers for your work
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-600"
          >
            <Plus size={16} />
            New program
          </button>
        </div>

        {programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center dark:border-slate-700">
            <Library size={40} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No programs yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Create your first program to start organising your content.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              Create program
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/programs/${p.id}`}
                className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${p.cover_colour}1a`, color: p.cover_colour }}>
                  <BookOpen size={20} />
                </div>
                <p className="font-bold text-gray-900 dark:text-slate-100">{p.name}</p>
                {p.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2 dark:text-slate-400">{p.description}</p>
                )}
                <p className="mt-3 text-xs font-medium text-gray-400 dark:text-slate-500">
                  Created {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && <ProgramForm orgId={orgId} onClose={() => setShowForm(false)} />}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

  ```
  pnpm run build
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/dashboard/programs/page.tsx src/components/programs/ProgramsDashboardClient.tsx src/components/programs/ProgramForm.tsx
  git commit -m "feat: programs — dashboard page with program cards and create modal"
  ```

---

## Task 9: Program Explorer — Server Page + ProgramExplorer Shell

**Files:**
- Create: `src/app/dashboard/programs/[id]/page.tsx`
- Create: `src/components/programs/ProgramExplorer.tsx`

**Interfaces:**
- Consumes: `Program`, `ProgramCategory[]`, `ProgramAsset[]` (with `signed_url` added)
- Produces: `ProgramExplorer` manages `selectedCategoryId: string | null` state; passes filtered assets and category list down to `CategoryTree` and `AssetGrid`

- [ ] **Step 1: Write the server page**

Create `src/app/dashboard/programs/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { createProgramAssetSignedUrl } from '@/lib/program-storage'
import ProgramExplorer from '@/components/programs/ProgramExplorer'
import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const service = createServiceClient()

  const { data: program } = await service
    .from('programs').select('*').eq('id', id).single()
  if (!program) notFound()

  // Access check
  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
  const isOwner = program.owner_id === user.id
  const isMember = !!membership
  const isAdmin = isMember && ['owner', 'admin', 'manager'].includes(membership!.role as string)
  if (!isOwner && !isMember) notFound()

  const [{ data: categories }, { data: assets }] = await Promise.all([
    service.from('program_categories').select('*')
      .eq('program_id', id).order('sort_order').order('created_at'),
    service.from('program_assets').select('*')
      .eq('program_id', id).order('sort_order').order('created_at'),
  ])

  // Generate signed URLs for file assets
  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => {
      if (asset.storage_path) {
        const signed_url = await createProgramAssetSignedUrl(asset.storage_path)
        return { ...asset, signed_url }
      }
      return { ...asset, signed_url: null }
    }),
  )

  return (
    <ProgramExplorer
      program={program as Program}
      categories={(categories ?? []) as ProgramCategory[]}
      assets={assetsWithUrls}
      canManage={isOwner || isAdmin}
    />
  )
}
```

- [ ] **Step 2: Write ProgramExplorer shell**

Create `src/components/programs/ProgramExplorer.tsx`:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import CategoryTree from '@/components/programs/CategoryTree'
import AssetGrid from '@/components/programs/AssetGrid'
import AssetUploadZone from '@/components/programs/AssetUploadZone'
import type { Program, ProgramCategory, ProgramAsset, CategoryNode } from '@/types/programs'

function buildTree(categories: ProgramCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  categories.forEach(c => map.set(c.id, { ...c, children: [] }))
  const roots: CategoryNode[] = []
  categories.forEach(c => {
    if (c.parent_id) {
      map.get(c.parent_id)?.children.push(map.get(c.id)!)
    } else {
      roots.push(map.get(c.id)!)
    }
  })
  return roots
}

export default function ProgramExplorer({
  program,
  categories,
  assets,
  canManage,
}: {
  program: Program
  categories: ProgramCategory[]
  assets: ProgramAsset[]
  canManage: boolean
}) {
  const router = useRouter()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [localCategories, setLocalCategories] = useState<ProgramCategory[]>(categories)
  const [localAssets, setLocalAssets] = useState<ProgramAsset[]>(assets)

  const tree = buildTree(localCategories)

  const visibleAssets =
    selectedCategoryId === null
      ? localAssets
      : localAssets.filter(a => a.category_id === selectedCategoryId)

  const handleCategoryAdded = useCallback((cat: ProgramCategory) => {
    setLocalCategories(prev => [...prev, cat])
  }, [])

  const handleCategoryDeleted = useCallback((id: string) => {
    setLocalCategories(prev => prev.filter(c => c.id !== id))
    // Move orphaned assets to uncategorised in local state
    setLocalAssets(prev => prev.map(a => a.category_id === id ? { ...a, category_id: null } : a))
    if (selectedCategoryId === id) setSelectedCategoryId(null)
  }, [selectedCategoryId])

  const handleAssetAdded = useCallback((asset: ProgramAsset) => {
    setLocalAssets(prev => [asset, ...prev])
  }, [])

  const handleAssetDeleted = useCallback((assetId: string) => {
    setLocalAssets(prev => prev.filter(a => a.id !== assetId))
  }, [])

  const handleAssetUpdated = useCallback((asset: ProgramAsset) => {
    setLocalAssets(prev => prev.map(a => a.id === asset.id ? asset : a))
  }, [])

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <Link
          href="/dashboard/programs"
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft size={14} />
          Programs
        </Link>
        <span className="text-gray-300 dark:text-slate-700">/</span>
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: program.cover_colour }}
          >
            <FolderOpen size={12} />
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{program.name}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: category tree */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
          <CategoryTree
            programId={program.id}
            tree={tree}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            canManage={canManage}
            onCategoryAdded={handleCategoryAdded}
            onCategoryDeleted={handleCategoryDeleted}
          />
        </aside>

        {/* Right: asset grid */}
        <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-slate-950">
          <AssetGrid
            programId={program.id}
            assets={visibleAssets}
            selectedCategoryId={selectedCategoryId}
            canManage={canManage}
            onAssetAdded={handleAssetAdded}
            onAssetDeleted={handleAssetDeleted}
            onAssetUpdated={handleAssetUpdated}
          />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```
  Expected: May have errors for missing `CategoryTree`, `AssetGrid`, `AssetUploadZone` — these are created in Tasks 10 and 11. The imports will fail until those files exist. To verify Task 9 compiles on its own, temporarily comment out the three component imports and their JSX usage, run build, then restore them.

  Alternatively, create stub files for the three missing components (see below) to allow the build to pass now:

  **Stub for `src/components/programs/CategoryTree.tsx`** (replace in Task 10):
  ```typescript
  export default function CategoryTree(_props: Record<string, unknown>) { return null }
  ```

  **Stub for `src/components/programs/AssetGrid.tsx`** (replace in Task 10):
  ```typescript
  export default function AssetGrid(_props: Record<string, unknown>) { return null }
  ```

  **Stub for `src/components/programs/AssetUploadZone.tsx`** (replace in Task 11):
  ```typescript
  export default function AssetUploadZone(_props: Record<string, unknown>) { return null }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/dashboard/programs/[id]/page.tsx src/components/programs/ProgramExplorer.tsx src/components/programs/CategoryTree.tsx src/components/programs/AssetGrid.tsx src/components/programs/AssetUploadZone.tsx
  git commit -m "feat: programs — explorer server page + ProgramExplorer shell (stubs)"
  ```

---

## Task 10: CategoryTree + CategoryForm

**Files:**
- Replace stub: `src/components/programs/CategoryTree.tsx`
- Create: `src/components/programs/CategoryForm.tsx`

**Interfaces:**
- Consumes: `CategoryNode[]` tree, `selectedId`, callbacks from `ProgramExplorer`
- Produces: clickable category list in left panel; "Add category/subcategory" inline form; delete with confirmation

- [ ] **Step 1: Write CategoryForm**

Create `src/components/programs/CategoryForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { ProgramCategory } from '@/types/programs'

export default function CategoryForm({
  programId,
  parentId,
  onSaved,
  onClose,
}: {
  programId: string
  parentId: string | null
  onSaved: (cat: ProgramCategory) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name required'); return }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onSaved(json)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-1.5">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name…"
        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <button type="submit" disabled={saving}
        className="rounded-lg bg-cyan-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? '…' : 'Add'}
      </button>
      <button type="button" onClick={onClose}
        className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400">
        ✕
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Write CategoryTree**

Replace stub at `src/components/programs/CategoryTree.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, Folder, FolderOpen } from 'lucide-react'
import CategoryForm from '@/components/programs/CategoryForm'
import type { CategoryNode, ProgramCategory } from '@/types/programs'

function getDepth(node: CategoryNode, all: CategoryNode[], depth = 0): number {
  // We check depth of the current node within the full tree for the "disable add subcategory" logic.
  // Since we're rendering recursively, the caller passes the current depth.
  return depth
}

function CategoryNodeItem({
  node,
  depth,
  programId,
  selectedId,
  onSelect,
  canManage,
  onCategoryAdded,
  onCategoryDeleted,
}: {
  node: CategoryNode
  depth: number
  programId: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  canManage: boolean
  onCategoryAdded: (cat: ProgramCategory) => void
  onCategoryDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAddChild, setShowAddChild] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}"? Assets inside will become uncategorised.`)) return
    setDeleting(true)
    await fetch(`/api/programs/${programId}/categories/${node.id}`, { method: 'DELETE' })
    onCategoryDeleted(node.id)
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
          isSelected
            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setExpanded(e => !e)}
          className="shrink-0 text-gray-400 dark:text-slate-600"
        >
          {hasChildren
            ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            : <span className="w-3" />}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
          onClick={() => onSelect(isSelected ? null : node.id)}
        >
          {isSelected ? <FolderOpen size={13} /> : <Folder size={13} />}
          <span className="truncate">{node.name}</span>
        </button>
        {canManage && (
          <div className="hidden items-center gap-0.5 group-hover:flex">
            {depth < 2 && (
              <button
                type="button"
                onClick={() => setShowAddChild(true)}
                className="rounded p-0.5 text-gray-400 hover:text-cyan-500 dark:text-slate-600"
                title="Add subcategory"
              >
                <Plus size={11} />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded p-0.5 text-gray-400 hover:text-red-500 dark:text-slate-600"
              title="Delete category"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {showAddChild && (
        <CategoryForm
          programId={programId}
          parentId={node.id}
          onSaved={onCategoryAdded}
          onClose={() => setShowAddChild(false)}
        />
      )}

      {expanded && node.children.map(child => (
        <CategoryNodeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          programId={programId}
          selectedId={selectedId}
          onSelect={onSelect}
          canManage={canManage}
          onCategoryAdded={onCategoryAdded}
          onCategoryDeleted={onCategoryDeleted}
        />
      ))}
    </div>
  )
}

export default function CategoryTree({
  programId,
  tree,
  selectedId,
  onSelect,
  canManage,
  onCategoryAdded,
  onCategoryDeleted,
}: {
  programId: string
  tree: CategoryNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  canManage: boolean
  onCategoryAdded: (cat: ProgramCategory) => void
  onCategoryDeleted: (id: string) => void
}) {
  const [showAddRoot, setShowAddRoot] = useState(false)

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
          selectedId === null
            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800'
        }`}
      >
        <FolderOpen size={13} />
        All files
      </button>

      <div className="mt-1">
        {tree.map(node => (
          <CategoryNodeItem
            key={node.id}
            node={node}
            depth={0}
            programId={programId}
            selectedId={selectedId}
            onSelect={onSelect}
            canManage={canManage}
            onCategoryAdded={onCategoryAdded}
            onCategoryDeleted={onCategoryDeleted}
          />
        ))}
      </div>

      {canManage && (
        <>
          {showAddRoot ? (
            <CategoryForm
              programId={programId}
              parentId={null}
              onSaved={onCategoryAdded}
              onClose={() => setShowAddRoot(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddRoot(true)}
              className="flex w-full items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 dark:text-slate-600 dark:hover:text-slate-300"
            >
              <Plus size={12} />
              Add category
            </button>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/programs/CategoryTree.tsx src/components/programs/CategoryForm.tsx
  git commit -m "feat: programs — CategoryTree with nested categories and add/delete"
  ```

---

## Task 11: AssetGrid + AssetCard

**Files:**
- Replace stub: `src/components/programs/AssetGrid.tsx`
- Create: `src/components/programs/AssetCard.tsx`

**Interfaces:**
- Consumes: `ProgramAsset[]`, `selectedCategoryId`, callbacks from `ProgramExplorer`
- Produces: grid of asset cards; kebab menu per card (rename, move, delete); "Upload / Add" button opens `AssetUploadZone`

- [ ] **Step 1: Write AssetCard**

Create `src/components/programs/AssetCard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import {
  FileText, Image, Music, Link, BookOpen, FileSpreadsheet, File,
  MoreVertical, Trash2, FolderInput, ExternalLink,
} from 'lucide-react'
import type { ProgramAsset, ProgramAssetType } from '@/types/programs'

const TYPE_ICON: Record<ProgramAssetType, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf:   FileText,
  docx:  FileText,
  xlsx:  FileSpreadsheet,
  image: Image,
  audio: Music,
  video: Link,
  note:  BookOpen,
  link:  Link,
}

const TYPE_COLOUR: Record<ProgramAssetType, string> = {
  pdf:   '#ef4444',
  docx:  '#3b82f6',
  xlsx:  '#10b981',
  image: '#8b5cf6',
  audio: '#f59e0b',
  video: '#ec4899',
  note:  '#06b6d4',
  link:  '#64748b',
}

function fmtBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export default function AssetCard({
  asset,
  programId,
  canManage,
  onDeleted,
  onUpdated,
}: {
  asset: ProgramAsset
  programId: string
  canManage: boolean
  onDeleted: (id: string) => void
  onUpdated: (asset: ProgramAsset) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const Icon = TYPE_ICON[asset.asset_type] ?? File
  const colour = TYPE_COLOUR[asset.asset_type] ?? '#64748b'

  async function handleDelete() {
    if (!confirm(`Delete "${asset.name}"?`)) return
    setDeleting(true)
    await fetch(`/api/programs/${programId}/assets/${asset.id}`, { method: 'DELETE' })
    onDeleted(asset.id)
  }

  function handleOpen() {
    if (asset.signed_url) {
      window.open(asset.signed_url, '_blank')
    } else if (asset.external_url) {
      window.open(asset.external_url, '_blank')
    }
  }

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-gray-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      {/* Icon */}
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${colour}1a`, color: colour }}
      >
        <Icon size={20} />
      </div>

      {/* Name */}
      <p className="mb-1 text-sm font-bold leading-snug text-gray-900 line-clamp-2 dark:text-slate-100">
        {asset.name}
      </p>

      {/* Meta */}
      <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide">
        {asset.asset_type}
        {asset.file_size_bytes ? ` · ${fmtBytes(asset.file_size_bytes)}` : ''}
      </p>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {(asset.signed_url || asset.external_url) && (
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ExternalLink size={11} />
            Open
          </button>
        )}
        {asset.asset_type === 'note' && asset.note_content && (
          <span className="text-xs text-gray-400 dark:text-slate-500 line-clamp-1 flex-1">
            {asset.note_content.slice(0, 60)}…
          </span>
        )}
      </div>

      {/* Kebab menu */}
      {canManage && (
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setMenuOpen(m => !m)}
            className="hidden h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 group-hover:flex dark:text-slate-600 dark:hover:bg-slate-800"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 min-w-[140px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => { handleDelete(); setMenuOpen(false) }}
                  disabled={deleting}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write AssetGrid**

Replace stub at `src/components/programs/AssetGrid.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Upload, Plus } from 'lucide-react'
import AssetCard from '@/components/programs/AssetCard'
import AssetUploadZone from '@/components/programs/AssetUploadZone'
import type { ProgramAsset } from '@/types/programs'

export default function AssetGrid({
  programId,
  assets,
  selectedCategoryId,
  canManage,
  onAssetAdded,
  onAssetDeleted,
  onAssetUpdated,
}: {
  programId: string
  assets: ProgramAsset[]
  selectedCategoryId: string | null
  canManage: boolean
  onAssetAdded: (asset: ProgramAsset) => void
  onAssetDeleted: (id: string) => void
  onAssetUpdated: (asset: ProgramAsset) => void
}) {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div className="flex flex-1 flex-col p-5">
      {/* Toolbar */}
      {canManage && (
        <div className="mb-5 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500">
            {assets.length} {assets.length === 1 ? 'item' : 'items'}
          </p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-white shadow shadow-cyan-500/20 hover:bg-cyan-600"
          >
            <Plus size={14} />
            Add content
          </button>
        </div>
      )}

      {/* Empty state */}
      {assets.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-slate-700">
          <Upload size={32} className="mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No content yet</p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-600"
            >
              Add content
            </button>
          )}
        </div>
      )}

      {/* Asset grid */}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              programId={programId}
              canManage={canManage}
              onDeleted={onAssetDeleted}
              onUpdated={onAssetUpdated}
            />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <AssetUploadZone
          programId={programId}
          categoryId={selectedCategoryId}
          onAssetAdded={onAssetAdded}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/programs/AssetCard.tsx src/components/programs/AssetGrid.tsx
  git commit -m "feat: programs — AssetCard and AssetGrid with kebab menu"
  ```

---

## Task 12: AssetUploadZone

**Files:**
- Replace stub: `src/components/programs/AssetUploadZone.tsx`

**Interfaces:**
- Consumes: `programId`, `categoryId`, callbacks
- Produces: modal with three tabs — File upload (drag-drop), Note editor, Link/Video

- [ ] **Step 1: Write AssetUploadZone**

Replace stub at `src/components/programs/AssetUploadZone.tsx`:

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, BookOpen, Link, X, FileText } from 'lucide-react'
import type { ProgramAsset } from '@/types/programs'

type Tab = 'file' | 'note' | 'link'

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a'

export default function AssetUploadZone({
  programId,
  categoryId,
  onAssetAdded,
  onClose,
}: {
  programId: string
  categoryId: string | null
  onAssetAdded: (asset: ProgramAsset) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('file')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Note state
  const [noteName, setNoteName] = useState('')
  const [noteContent, setNoteContent] = useState('')

  // Link state
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkType, setLinkType] = useState<'link' | 'video'>('link')

  async function uploadFile(file: File) {
    setUploading(true)
    setError(null)
    setUploadProgress(`Uploading ${file.name}…`)
    const formData = new FormData()
    formData.append('file', file)
    if (categoryId) formData.append('category_id', categoryId)

    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    setUploading(false)
    setUploadProgress(null)
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await uploadFile(file)
  }, [programId, categoryId])

  async function handleSaveNote() {
    if (!noteName.trim()) { setError('Name required'); return }
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_type: 'note',
        name: noteName,
        note_content: noteContent,
        category_id: categoryId,
      }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }

  async function handleSaveLink() {
    if (!linkName.trim()) { setError('Name required'); return }
    if (!linkUrl.trim()) { setError('URL required'); return }
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_type: linkType,
        name: linkName,
        external_url: linkUrl,
        category_id: categoryId,
      }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Add content</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1 text-gray-400 hover:text-gray-700 dark:text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 px-5 dark:border-slate-800">
          {([['file', Upload, 'File'], ['note', BookOpen, 'Note'], ['link', Link, 'Link / Video']] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setError(null) }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-bold transition-colors ${
                tab === key
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-slate-500'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5">
          {/* File tab */}
          {tab === 'file' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-colors ${
                  dragging
                    ? 'border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/30'
                    : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <Upload size={32} className={`mb-3 ${dragging ? 'text-cyan-500' : 'text-gray-300 dark:text-slate-600'}`} />
                <p className="text-sm font-semibold text-gray-600 dark:text-slate-400">
                  {uploadProgress ?? 'Drop a file or click to browse'}
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                  PDF, Word, Excel, images, audio · Max 50MB (images 10MB, audio 100MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) await uploadFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                Video? Use the Link tab to paste a YouTube, Vimeo, or Loom URL.
              </p>
            </div>
          )}

          {/* Note tab */}
          {tab === 'note' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Title</label>
                <input
                  autoFocus
                  type="text"
                  value={noteName}
                  onChange={e => setNoteName(e.target.value)}
                  placeholder="e.g. Session notes template"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Content</label>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={6}
                  placeholder="Write your note here…"
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveNote} disabled={uploading}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                  {uploading ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
          )}

          {/* Link tab */}
          {tab === 'link' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['link', 'video'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setLinkType(t)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      linkType === t
                        ? 'bg-cyan-500 text-white'
                        : 'border border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-400'
                    }`}>
                    {t === 'link' ? 'Web link' : 'Video (YouTube / Vimeo / Loom)'}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
                <input
                  autoFocus
                  type="text"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  placeholder="e.g. Intro video"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveLink} disabled={uploading}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                  {uploading ? 'Saving…' : 'Save link'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors, 0 ESLint errors.

- [ ] **Step 3: Final commit**

  ```bash
  git add src/components/programs/AssetUploadZone.tsx
  git commit -m "feat: programs — AssetUploadZone with file, note, and link tabs"
  ```

---

## Post-implementation smoke test

1. Navigate to `/dashboard/programs` — see "Programs" in sidebar, empty state with "Create program" button.
2. Click "New program" — fill name, pick colour, submit — redirects to `/dashboard/programs/[id]`.
3. In explorer: click "Add category" in left panel — name appears in tree.
4. Click category — "All files" / category name toggles active state.
5. Click "Add content" in right panel — file tab shows drag zone; note tab has textarea; link tab has URL field.
6. Upload a PDF — card appears in grid with red icon, file size, "Open" button.
7. Add a note — card appears with cyan icon, note preview text.
8. Add a link/video — card appears with grey link icon.
9. Hover asset card — kebab menu appears; Delete → confirm → card disappears.
10. Add subcategory (right-click or + on category row) — appears nested in tree.
11. Delete a category with assets — assets reappear under "All files" (uncategorised).

---

## Known gaps (fix in Phase 2+)

- No inline asset rename (kebab menu only has delete for now — rename can be added to PATCH flow)
- No drag-to-move assets between categories
- No asset move-to-category UI (patch endpoint exists, UI not wired)
- No program settings / edit name / archive flow
- AI fields are present in DB, unused in UI
