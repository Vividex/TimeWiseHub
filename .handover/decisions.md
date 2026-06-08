# Standing decisions

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript UI; no paid API calls expected.
  Supabase `apply_migration` / `db push` is free.

## Architecture
- **Force-assign** is enforced in the UI via `currentUserRole` check only — not
  a server-side policy. This is consistent with how expense approval role checks
  are handled elsewhere in this codebase. The existing `FOR ALL` RLS policy
  already allows any org member to update tasks; restricting the UI is sufficient.
- **Pool scope**: only tasks from active (`status = 'active'`) org projects
  (`org_id IS NOT NULL`). Solo users (no org membership) see an empty pool and
  their personal task bucket only.
- **Self-claim** uses a direct Supabase client UPDATE (`assignee_id = currentUserId`).
  No API route is needed.
- **Unassigned task creation**: the updated `TaskForm` defaults to "Unassigned"
  when `orgMembers` is provided. For solo users (prop absent), behaviour is
  unchanged (auto-assign to self).

## Constraints
- Do not add npm dependencies.
- Do not modify auth, billing, expenses, or any component outside the task/project
  tree and `DashboardShell`.
- Match existing style: `rounded-2xl` cards, `bg-gray-50 border-gray-100`,
  cyan accent (`bg-cyan-500`, `text-cyan-600`), `text-xs font-bold` priority
  badges — copy patterns from `TaskList.tsx`.
- `ConfirmDialog` is at `src/components/ConfirmDialog.tsx` — import from
  `@/components/ConfirmDialog` (though no delete action is needed in the new
  pool/my-tasks views).
- The new migration must use `CREATE INDEX IF NOT EXISTS` to be idempotent.
