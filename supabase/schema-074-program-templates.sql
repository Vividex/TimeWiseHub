-- supabase/schema-074-program-templates.sql
-- Programs Phase 3: template builder

alter table public.programs
  add column is_template boolean not null default false;
