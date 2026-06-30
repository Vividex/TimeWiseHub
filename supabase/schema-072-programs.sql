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
