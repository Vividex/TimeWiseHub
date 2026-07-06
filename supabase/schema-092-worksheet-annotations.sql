-- ============================================================
-- TimeWiseHub — Schema 092: Collaborative worksheet annotation
-- Lets a tutor and student place text/stroke/sticker objects on a
-- shared topic_assets PDF/image, live or async. Run via Supabase MCP
-- apply_migration (name: worksheet_annotations)
-- ============================================================

create type public.worksheet_object_type as enum ('text_box', 'stroke', 'sticker');

create table public.worksheet_annotations (
  id             uuid primary key default gen_random_uuid(),
  topic_asset_id uuid not null references public.topic_assets on delete cascade,
  student_id     uuid not null references public.students on delete cascade,
  page_number    integer not null default 1,
  object_type    public.worksheet_object_type not null,
  x              numeric(6,5) not null,
  y              numeric(6,5) not null,
  width          numeric(6,5) not null,
  height         numeric(6,5) not null,
  content        jsonb not null,
  created_by     uuid not null references public.profiles on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index worksheet_annotations_scope
  on public.worksheet_annotations (topic_asset_id, student_id, created_at);

alter table public.worksheet_annotations enable row level security;

-- Resolves access via topic_assets -> topics -> subjects (org OR solo creator),
-- OR via the specific guest identity tied to the client who owns the student.
-- Mirrors src/lib/tutoring/topic-access.ts (org/solo branching) and
-- can_post_chat() (guest branching) — see schema-078-session-chat.sql.
create or replace function public.can_edit_worksheet(p_topic_asset_id uuid, p_student_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_org_id uuid;
  v_subject_created_by uuid;
  v_client_id uuid;
  v_guest_user_id uuid;
begin
  select s.org_id, s.created_by into v_org_id, v_subject_created_by
  from public.topic_assets ta
  join public.topics t on t.id = ta.topic_id
  join public.subjects s on s.id = t.subject_id
  where ta.id = p_topic_asset_id;

  if v_org_id is null and v_subject_created_by is null then
    return false;
  end if;

  if v_org_id is not null then
    if exists (
      select 1 from public.organisation_members om
      where om.org_id = v_org_id and om.user_id = auth.uid()
    ) then
      return true;
    end if;
  else
    if v_subject_created_by = auth.uid() then
      return true;
    end if;
  end if;

  select client_id into v_client_id from public.students where id = p_student_id;
  if v_client_id is null then return false; end if;

  select guest_chat_user_id into v_guest_user_id from public.clients where id = v_client_id;
  if v_guest_user_id is not null and v_guest_user_id = auth.uid() then
    return true;
  end if;

  return false;
end;
$$;

create policy "Can view worksheet annotations" on public.worksheet_annotations for select
  using (public.can_edit_worksheet(topic_asset_id, student_id));

create policy "Can manage worksheet annotations" on public.worksheet_annotations for all
  using (public.can_edit_worksheet(topic_asset_id, student_id))
  with check (public.can_edit_worksheet(topic_asset_id, student_id));

-- Storage bucket for ad hoc uploaded stickers. Path convention:
-- {topicAssetId}/{studentId}/{filename} — lets a storage policy resolve
-- access via the same can_edit_worksheet() function using path segments.
insert into storage.buckets (id, name, public) values ('worksheet-stickers', 'worksheet-stickers', false);

create policy "worksheet-stickers: read with access" on storage.objects for select
  using (
    bucket_id = 'worksheet-stickers'
    and public.can_edit_worksheet(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

create policy "worksheet-stickers: upload with access" on storage.objects for insert
  with check (
    bucket_id = 'worksheet-stickers'
    and public.can_edit_worksheet(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );
