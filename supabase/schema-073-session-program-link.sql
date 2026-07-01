-- supabase/schema-073-session-program-link.sql
-- Programs Phase 4: link a session to a reference program

alter table public.sessions
  add column program_id uuid references public.programs(id) on delete set null;
