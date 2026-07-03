-- ============================================================
-- TimeWiseHub — Schema 077: Session chat enum value
-- Must be applied and committed BEFORE schema-078 references it —
-- Postgres requires a new enum value to be committed before it can be
-- used in the same or a later transaction.
-- Run via Supabase MCP apply_migration (name: session_chat_enum)
-- ============================================================

alter type public.chat_conversation_type add value 'session';
