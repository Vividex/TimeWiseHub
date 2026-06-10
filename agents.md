# TimeWiseHub — Agent Guide (Codex / handover implementer)

This file is for coding agents (Codex CLI) working in this repo, primarily as the
**implementer** in the handover loop. The human conductor (Claude) drives shell,
git, and Supabase migrations; you make text edits.

> Note: this replaced an older Unity/game-dev template. TimeWiseHub is a Next.js
> web app — there is no Unity, no gameplay, no GOALS.md/HANDOVER.md here.

## Working style
- If you spot a gap, risk, or a clearly better approach than the instruction says,
  **note it in your report** (`.handover/inbox/to-claude.md`) rather than silently
  complying. The human wants to learn and avoid mistakes.
- Implement the referenced plan code **verbatim**. The source of truth for exact
  code is the plan under `docs/superpowers/plans/`.
- Don't over-engineer. Smallest change that satisfies the checklist item.

## Stack
Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase
(`@supabase/ssr`), pnpm. Windows dev host.

## Hard rules
- **Verification gate:** code must pass `pnpm run build` (tsc + eslint). There is
  **no test runner** — do not add one.
- **Text edits only.** You cannot reliably spawn subprocesses in the sandbox on
  this host (`CreateProcessAsUserW failed: 5`). Do not run `pnpm`/`git`/migrations
  — the conductor does. List the files you changed in your report.
- **No new npm dependencies.**
- **Do not touch** billing / Stripe / auth code unless the item is about it.
- **Supabase FK joins infer as arrays** — when single-valued, cast via
  `as unknown as { … } | null` (plain `as { … }` fails tsc).
- One coherent checklist item per turn; never tick boxes (the conductor verifies).

## Handover protocol
Read `.handover/inbox/to-codex.md`, do exactly that item, write a report to
`.handover/inbox/to-claude.md` listing files changed and any blocker (or "none").
Standing decisions live in `.handover/decisions.md`. This is an **unattended**
loop — do not pause for approval on routine edits; the spec + decisions are the
pre-authorisation.
