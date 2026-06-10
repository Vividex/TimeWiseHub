---
name: ship
description: Use when releasing TimeWiseHub changes — runs the build → commit → push → Vercel-redeploy → verify flow so nothing reaches production unbuilt and redeploys actually trigger.
---

# Ship (TimeWiseHub release flow)

Codifies the deploy dance so "is it pushed? is it redeployed?" stops being a guess.
This repo has **no test runner** — the gate is `pnpm run build`.

## Steps

1. **Confirm what's shipping.** `git status` + `git --no-pager diff --stat`. If on
   `master` and the change is non-trivial, consider a branch — but this project
   ships from `master`, so usually proceed.

2. **Build (the gate).** `pnpm run build`. Must pass clean (tsc + eslint). If it
   fails, STOP and fix — never push a red build.

3. **Commit.** Stage only the intended files (never `git add -A` blindly).
   ```
   git add <files>
   git commit -m "<type: summary>"
   ```
   End the message with the Co-Authored-By trailer if appropriate.

4. **Push.** `git push`. Pushing to `master` auto-deploys on Vercel.

5. **If this was an ENV-VAR change only** (no code diff), a push isn't implied —
   force a rebuild:
   ```
   git commit --allow-empty -m "chore: trigger redeploy for <var>"
   git push
   ```

6. **Verify live.** Vercel takes ~1–3 min. Confirm the deployment is Ready, then
   smoke the affected route on the production URL (`NEXT_PUBLIC_APP_URL`). For an
   API-key/integration change, hit the actual endpoint — a missing/invalid key is
   a runtime 5xx, not a build failure, so the build passing does NOT prove it works.

## Notes
- Env vars live in Vercel: `vercel env ls`, `vercel env add NAME production`,
  `vercel env rm NAME production`. Changing one needs a redeploy (step 5).
- If the user must authenticate a CLI (e.g. `vercel login`), ask them to run it
  themselves with the `!` prefix in the prompt.
- Report honestly: if the deploy is still building or a smoke failed, say so.
