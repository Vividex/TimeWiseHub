# TimeWiseHub — Project Guide for Claude

## How I want you to work with me (read this first)

I'm relatively new to this. I want to **learn** and I want to **avoid doing
something stupid**. So:

- **Challenge me.** If you see a gap in my approach, a risk, or a simpler/better
  way to get what I'm asking for, **tell me before just doing what I said.** A
  one-line "Heads up: X might bite you because Y — want to do Z instead?" is
  exactly what I want. Don't silently comply with a flawed request.
- **Teach as you go.** Briefly explain *why*, not just *what* — especially when a
  choice is non-obvious or specific to this codebase. I'd rather understand the
  trade-off than get a black box.
- **Surface unknowns.** If something is ambiguous or you're guessing, say so
  rather than inventing. "I don't know X, here's how I'd find out" beats a
  confident wrong answer.
- **Don't over-engineer.** YAGNI. Prefer the smallest change that solves the real
  problem. Flag when I'm asking for more than I need.
- Being direct is welcome. I won't take "that's a bad idea because…" personally —
  I'll thank you for it.

## Stack
Next.js 16 (App Router, RSC), React 19, TypeScript strict, Tailwind v4, Supabase
(`@supabase/ssr`), Stripe, web-push, Resend (email). Package manager: **pnpm**.
Also wraps a Tauri desktop build. Deployed on **Vercel**. Dev OS: **Windows**.

## Verification gate (there is NO test runner)
- After any code change, the gate is **`pnpm run build`** (runs `next build` =
  tsc + eslint). It must pass clean.
- Beyond build: **manual smoke** in the browser, and for anything role/RLS-related
  a **two-account check** (e.g. admin vs employee) or a quick SQL check.
- Do **not** add Jest/Vitest or any test framework unless I ask.

## Supabase conventions
- Project id: `sdwwlnnsijcadkdwsvud`. Inspect/modify via the Supabase MCP
  (`list_tables`, `execute_sql`, `apply_migration`).
- Migrations are committed as `supabase/schema-NNN-<name>.sql` (incrementing
  number) **and** applied to the remote DB via MCP `apply_migration`. Keep the
  file and the applied migration in sync.
- Every table needs **RLS policies** — usually scoped through
  `organisation_members` (org membership) and/or `owner_id`/`user_id`.
- **Type gotcha:** Supabase infers foreign-key joins as *arrays* even when
  single-valued. When you know it's one row, cast via
  `(row.relation as unknown as { field: T } | null)?.field`. The plain
  `as { … }` cast fails tsc; the `as unknown as …` intermediate is required.

## Deploy (Vercel)
- Pushing to `master` auto-deploys. A redeploy **requires a push** — if you only
  change an env var, push an empty commit to trigger a rebuild
  (`git commit --allow-empty -m "chore: redeploy"`).
- **Env vars live in Vercel**, not just `.env.local`. Manage with the `vercel`
  CLI (`vercel env ls` / `vercel env add NAME production`). See `.env.example`
  for the full list of names. A missing/invalid key shows up as a 5xx from the
  relevant API route, not a build error.
- There's a custom `ship` skill that runs build → commit → push → confirm
  redeploy; prefer it for releases.

## Windows / tooling notes
- Shell is **PowerShell** (`$env:VAR`, `$null`, backtick line-continuation). Bash
  is available for POSIX scripts.
- Writing TSX that contains single quotes (`'use client'`) via bash heredoc
  fails. Use the Write tool, or PowerShell `@'…'@` here-strings.
- In the **handover loop**, Codex's `workspace-write` sandbox can't spawn
  subprocesses on Windows (`CreateProcessAsUserW failed: 5`). So **Codex does
  text edits only**; the conductor (you) runs all shell (`pnpm`, `git`) and any
  Supabase migration.
- `.gitattributes` normalises line endings to LF — don't fight the CRLF warnings.

## Guardrails — ask before doing
- Don't touch **billing / Stripe / auth** code unless the task is explicitly about
  it.
- No new npm dependencies without flagging the cost first.
- Spending money (paid APIs, deploys with cost) is the one thing to confirm.
- Never `git push --force` or `git reset --hard` on `master` without asking.

## Where things live
- Specs: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.
  These are committed; I plan with you and implement via the handover loop.
- Handover mailbox: `.handover/` (`spec.md` checklist, `decisions.md`,
  `state.json` [gitignored]).
