# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript UI; no paid API calls expected.
  Supabase apply_migration is free.

## Notes (Phase 5.5b — confidential documents)
- Apply the DB migration using the Supabase MCP apply_migration tool.
  Migration name: confidential_documents
- Never touch billing, payment, auth, or Stripe code.
- Do not add npm dependencies (lucide-react is already installed).
- Confine changes to:
    supabase/schema-035-confidential-documents.sql (new file)
    src/app/dashboard/projects/[id]/page.tsx
    src/components/projects/DocumentPanel.tsx
- Leave all other components, pages, and API routes untouched.
- Codex handles text edits; conductor runs lint/tsc/git and apply_migration.
- The Supabase MCP apply_migration may require confirmation — conductor handles it.
- Match existing badge style: rounded-xl px-2 py-0.5 text-xs font-black uppercase tracking-wide.
- THIS PHASE INTENTIONALLY REPLACES EXISTING RLS POLICIES (unlike 5.5a):
  drop schema-008 "Project members can manage documents" and schema-024
  "Org members can view project documents", replacing them with the gated
  policies in spec.md C1. This is expected and authorized.
- pnpm is the package manager (pnpm lint). No test runner — verify with
  lint + tsc + SQL structural check + two-account RLS smoke.
