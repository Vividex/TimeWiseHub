# Add internal user-stats endpoint for VividexRevenue

## Goal
Add a small, secret-protected internal API endpoint reporting total user
count, so VividexRevenue (a separate private desktop tool) can read
aggregate metrics without direct database access.

## Stack / constraints
- Next.js App Router route handler, pnpm, `pnpm run build` is the only
  gate (no test framework)
- Net-new, isolated route -- do not touch existing Stripe/billing/auth code
- `SUPABASE_SERVICE_ROLE_KEY` already exists in this project's env --
  reuse it, do not create a new privileged credential
- Query `public.profiles` (confirmed schema: one row per signed-up user,
  `id references auth.users`)

## Acceptance checklist

- [x] E1 Create `src/app/api/internal/user-stats/route.ts`: GET handler,
  checks `x-internal-secret` header against
  `process.env.INTERNAL_STATS_SECRET` (401 if missing/mismatched), else
  queries `profiles` count via a Supabase service-role client and returns
  `{"total_users": <count>}`. Also add `INTERNAL_STATS_SECRET=` to
  `.env.example`.

## Verification
`pnpm run build` must pass clean. Manual: `curl` with the correct secret
returns `{"total_users": N}`; without/wrong secret returns 401.

**Verified 2026-07-27:** `pnpm run build` passed clean (route appears at
`/api/internal/user-stats` in the build output). Live-tested against the
already-running dev server on `:3000` with a real generated secret:
correct secret returned `{"total_users":15}` (HTTP 200, real data from the
live dev database); no secret returned `{"error":"unauthorized"}` (HTTP
401). Committed locally; **not pushed** pending explicit confirmation
(pushing to `master` auto-deploys to production).

## Rules for conductor
- Generate a random secret for `.env.local` directly (not through Codex --
  local secret file).
- Do NOT `git push` -- stop and get explicit user confirmation first,
  since pushing to `master` auto-deploys to production per this project's
  CLAUDE.md.
