-- ============================================================
-- TimeWiseHub — Schema 112: Drop client_sites.label
-- Site nicknames ("House", "Warehouse") read as unprofessional in
-- dropdowns/lists compared to the actual address, which is already a
-- required field on every site. Address becomes the sole identifier
-- everywhere a site is displayed; the label column and its data are
-- dropped rather than left as unused dead weight. Run via Supabase MCP
-- apply_migration (name: drop_client_sites_label)
-- ============================================================

alter table public.client_sites drop column label;
