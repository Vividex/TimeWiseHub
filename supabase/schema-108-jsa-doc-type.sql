-- ============================================================
-- TimeWiseHub — Schema 108: JSA document type
-- Adds doc_type to project_swms_documents so the same document list,
-- storage bucket, RLS, and crew-acknowledgment lifecycle can host both SWMS
-- (legislated HRCW work) and JSA (everyday small-scale task) documents.
-- Run via Supabase MCP apply_migration (name: jsa_doc_type)
-- ============================================================

alter table public.project_swms_documents
  add column doc_type text not null default 'swms';

alter table public.project_swms_documents
  add constraint project_swms_documents_doc_type_check
  check (doc_type in ('swms', 'jsa'));
