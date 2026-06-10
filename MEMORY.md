# MEMORY

## Repo Working Notes
- TimeWiseHub is a Next.js App Router app using TypeScript, Tailwind v4, Supabase, and pnpm.
- Verification gate is `pnpm run build`; there is no test runner.
- On this Windows host, sandboxed subprocesses can fail with `CreateProcessAsUserW failed: 5`; use approved/escalated read-only commands when needed.
- Do not add npm dependencies or touch billing, Stripe, or auth code unless the current task explicitly requires it.
- Handover-specific standing decisions live in `.handover/decisions.md`; do not edit `.handover/spec.md` or tick checklist boxes during handover turns.

## Recent Work
- Pushed commit `0a33b9f` to `origin/master`: `fix: improve mobile client project layouts`.
- Mobile tile layout was adjusted in `src/components/ui/Tile.tsx` so task/session titles do not overlap status badges.
- Selected client project header now wraps project actions inside the card, and delete confirmation wraps on mobile.
- Client project count now uses `projects.status = active`, matching the visible client projects page.
- Client financial details now include a `Create invoice` action.
- Invoice creation supports `?clientId=...` and preselects that client in `NewInvoiceForm`.

## Untracked Files Observed
- The working tree had unrelated untracked files such as `.playwright-mcp/`, image assets, and a dark-mode finance plan doc. They were not included in commit `0a33b9f`.
