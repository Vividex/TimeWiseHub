-- ============================================================
-- TimeWiseHub — Schema 085: Tutoring per-lesson billing
-- Second deep-dive feature for the Tutoring workspace profile (not
-- gated to tutoring -- billing sessions directly isn't an inherently
-- tutoring-only concept). Mirrors the existing time_entries.invoice_id
-- / invoice_items.time_entry_id pattern exactly. Run via Supabase MCP
-- apply_migration (name: tutoring_lesson_billing)
-- ============================================================

alter table public.sessions
  add column invoice_id uuid references public.invoices on delete set null;

create index sessions_invoice on public.sessions (invoice_id) where invoice_id is not null;

alter table public.invoice_items
  add column session_id uuid references public.sessions on delete set null;
