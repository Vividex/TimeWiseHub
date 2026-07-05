-- ============================================================
-- TimeWiseHub — Schema 083: Workspace Profile columns
-- Phase 1 of the Workspace Profile roadmap — additive only, no RLS changes
-- needed (organisations' existing "Owners and admins can update organisation
-- settings" policy and profiles' existing "Users can update their own
-- profile" policy already cover any column, including these new ones).
-- Run via Supabase MCP apply_migration (name: workspace_profile_columns)
-- ============================================================

alter table public.organisations
  add column workspace_profile text not null default 'generic',
  add column setup_completed boolean not null default false,
  add column setup_completed_at timestamptz;

alter table public.profiles
  add column workspace_profile text not null default 'generic',
  add column setup_completed boolean not null default false,
  add column setup_completed_at timestamptz;
