-- ============================================================
-- TimeWiseHub — Schema 093: Program can reference a Subjects worksheet
-- Additive nullable column — no data migration needed. Run via
-- Supabase MCP apply_migration (name: program_topic_asset_link)
-- ============================================================

alter table public.program_assets
  add column linked_topic_asset_id uuid references public.topic_assets(id) on delete cascade;

create index program_assets_linked_topic_asset
  on public.program_assets (linked_topic_asset_id) where linked_topic_asset_id is not null;
