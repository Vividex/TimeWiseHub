---
name: supabase-migration
description: Use when adding or changing TimeWiseHub database tables/columns — enforces the schema-NNN file + RLS-policy + apply-via-MCP house style so every migration is consistent and secure.
---

# Supabase migration (TimeWiseHub house style)

Project id: `sdwwlnnsijcadkdwsvud`. Apply via the Supabase MCP, keep a committed
SQL file in sync. **Every new table needs RLS** — forgetting it either leaks data
(if RLS is off) or returns nothing (if on with no policy).

## Steps

1. **Understand the current schema.** Use MCP `list_tables` (and `execute_sql` to
   inspect existing policies on a similar table). Copy the access pattern of the
   nearest existing table rather than inventing one.

2. **Pick the next number.** Look at `supabase/` for the highest existing
   `schema-NNN-*.sql` and use `NNN+1`. Name: `schema-NNN-<short-name>.sql`.

3. **Write the SQL file** including, in order:
   - `create table` with `id uuid primary key default gen_random_uuid()`,
     sensible FKs (`references … on delete …`), `created_at timestamptz default now()`.
   - Indexes for common lookups (the FK columns you'll filter on).
   - `alter table <t> enable row level security;`
   - **RLS policies** scoped the way this app does it — through
     `organisation_members` (org membership) and/or `owner_id`/`user_id`. Cover
     select/insert/update/delete as the feature needs.
   - An `updated_at` trigger if the table is edited in place (copy the existing
     `touch_*()` trigger pattern).

4. **Apply it** with MCP `apply_migration` (DDL) — NOT `execute_sql`. The
   conductor runs this; Codex cannot.

5. **Verify.** `list_migrations` shows your version; `execute_sql` a quick
   `select` to confirm the table + a policy behave (ideally check that a row is
   visible to its owner/org and invisible to an outsider — RLS is the whole point).

6. **Commit** the `schema-NNN-*.sql` file.

## Gotchas
- RLS "returns nothing" almost always means a missing/incorrect policy, not a bug
  in your query.
- FK joins read back as arrays in TS — see CLAUDE.md `as unknown as` cast.
- No raw `HKEY`/service-role usage from the browser; service role is server-only.
