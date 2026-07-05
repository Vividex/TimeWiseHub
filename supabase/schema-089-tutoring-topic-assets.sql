-- ============================================================
-- TimeWiseHub — Schema 089: Tutoring topic file uploads
-- Fifth deep-dive feature for the Tutoring workspace profile.
-- New topic-assets storage bucket + topic_assets table, modeled on
-- the existing program_assets pattern but without AI summarisation
-- or categories. Run via Supabase MCP apply_migration
-- (name: tutoring_topic_assets)
-- ============================================================

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
