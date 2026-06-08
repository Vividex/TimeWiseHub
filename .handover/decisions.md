# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript UI; no paid API calls expected.
  Supabase apply_migration is free.

## Notes
- Apply the DB migration using the Supabase MCP apply_migration tool.
  Migration name: member_project_client_access
- Never touch billing, payment, auth, or Stripe code.
- Do not add npm dependencies.
- Confine changes to:
    supabase/schema-029-member-project-client-access.sql (new file)
    src/app/api/projects/route.ts
    src/components/projects/ProjectForm.tsx
    src/app/dashboard/projects/page.tsx
    src/components/projects/ProjectCard.tsx
- Leave all other components, pages, and API routes untouched.
- Codex handles text edits; conductor runs lint/tsc/git.
- The Supabase MCP apply_migration may require confirmation — conductor handles it.
- Match existing badge style: rounded-xl px-2 py-0.5 text-xs font-black uppercase tracking-wide.
- Do not drop or modify existing RLS policies — only add new ones.
