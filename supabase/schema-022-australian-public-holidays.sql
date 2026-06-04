-- ============================================================
-- TimeWiseHub - Schema 022: Australian state preference
-- Run in Supabase SQL Editor
-- ============================================================

create type public.australian_state as enum ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA');

alter table public.profiles
  add column au_state public.australian_state;
