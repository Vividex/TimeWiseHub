-- ============================================================
-- TimeWiseHub — Schema 016: Fix activity log triggers
-- Replaces the shared trigger function with per-table functions
-- so PostgreSQL doesn't try to resolve field names from other tables.
-- Run in Supabase SQL Editor
-- ============================================================

-- Drop old triggers and shared function
drop trigger if exists trg_activity_time_entries on public.time_entries;
drop trigger if exists trg_activity_expenses      on public.expenses;
drop trigger if exists trg_activity_tasks         on public.tasks;
drop trigger if exists trg_activity_projects      on public.projects;
drop function if exists public.record_activity();

-- ── Per-table trigger functions ───────────────────────────────

create or replace function public.record_time_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'time_entries', coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'description',      coalesce(NEW.description,      OLD.description),
      'duration_seconds', coalesce(NEW.duration_seconds, OLD.duration_seconds)
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.record_expense_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'expenses', coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'amount',   coalesce(NEW.amount,       OLD.amount),
      'currency', coalesce(NEW.currency,     OLD.currency),
      'status',   coalesce(NEW.status::text, OLD.status::text)
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.record_task_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'tasks', coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'title',  coalesce(NEW.title,        OLD.title),
      'status', coalesce(NEW.status::text, OLD.status::text)
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.record_project_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'projects', coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'name',   coalesce(NEW.name,         OLD.name),
      'status', coalesce(NEW.status::text, OLD.status::text)
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

-- ── Re-attach triggers ────────────────────────────────────────

create trigger trg_activity_time_entries
  after insert or update or delete on public.time_entries
  for each row execute function public.record_time_activity();

create trigger trg_activity_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.record_expense_activity();

create trigger trg_activity_tasks
  after insert or update or delete on public.tasks
  for each row execute function public.record_task_activity();

create trigger trg_activity_projects
  after insert or update or delete on public.projects
  for each row execute function public.record_project_activity();
