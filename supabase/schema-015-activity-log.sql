-- ============================================================
-- TimeWiseHub — Schema 015: Activity log
-- Run in Supabase SQL Editor
-- ============================================================

create table public.activity_log (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles on delete set null,
  event_type  text not null,  -- INSERT, UPDATE, DELETE
  entity_type text not null,  -- time_entries, expenses, tasks, projects
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "Users can view their own activity"
  on public.activity_log for select
  using (auth.uid() = user_id);

create policy "Managers can view org member activity"
  on public.activity_log for select
  using (
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target
        on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = activity_log.user_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

create index activity_log_user_time on public.activity_log (user_id, created_at desc);

-- ── Trigger function ─────────────────────────────────────────

create or replace function public.record_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _meta jsonb;
begin
  _meta := case TG_TABLE_NAME
    when 'time_entries' then
      jsonb_build_object(
        'description', coalesce(NEW.description, OLD.description),
        'duration_seconds', coalesce(NEW.duration_seconds, OLD.duration_seconds)
      )
    when 'expenses' then
      jsonb_build_object(
        'amount', coalesce(NEW.amount, OLD.amount),
        'currency', coalesce(NEW.currency, OLD.currency),
        'status', coalesce(NEW.status::text, OLD.status::text)
      )
    when 'tasks' then
      jsonb_build_object(
        'title', coalesce(NEW.title, OLD.title),
        'status', coalesce(NEW.status::text, OLD.status::text)
      )
    when 'projects' then
      jsonb_build_object(
        'name', coalesce(NEW.name, OLD.name),
        'status', coalesce(NEW.status::text, OLD.status::text)
      )
    else null
  end;

  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), TG_OP, TG_TABLE_NAME, coalesce(NEW.id, OLD.id), _meta);

  return coalesce(NEW, OLD);
end;
$$;

-- ── Triggers ─────────────────────────────────────────────────

create trigger trg_activity_time_entries
  after insert or update or delete on public.time_entries
  for each row execute function public.record_activity();

create trigger trg_activity_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.record_activity();

create trigger trg_activity_tasks
  after insert or update or delete on public.tasks
  for each row execute function public.record_activity();

create trigger trg_activity_projects
  after insert or update or delete on public.projects
  for each row execute function public.record_activity();
