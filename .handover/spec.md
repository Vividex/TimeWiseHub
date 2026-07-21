# Unified Landing Page

## Goal
Consolidate the general `/` landing page and `/solutions/tutors` into a single route at `/`, with
a Navbar dropdown that swaps hero/feature content per business type — so Google only ever indexes
one URL for "timewisehub" instead of two near-identical pages, ahead of more industry pages being
added per the Workspace Profile roadmap.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-21-unified-landing-page-design.md`
- Source plan: `docs/superpowers/plans/2026-07-21-unified-landing-page.md` — 3 tasks, the exact
  code to transcribe for every file is in that plan. This checklist is the tracker; the plan file
  is the source of truth for content.
- The dropdown selection is **in-page state only** (no URL/query-param change) — a deliberate
  choice made during brainstorming since there's no current need for shareable per-industry links,
  and it removes any risk of Google indexing a second URL variant.
- Both existing Hero components and both FeatureCarousel components are structurally identical —
  only text/image content differs. This is why the design consolidates them into one prop-driven
  component pair reading from a shared `IndustryContent` config, rather than keeping parallel
  component trees per industry.
- Scope is deliberately `general` + `tutors` only — no placeholder entries for trades/cleaning/real
  estate, since that marketing copy doesn't exist yet and stubbing it now would likely be thrown
  away once those get designed properly.
- The dashboard's "Workspace Profile" system (per-account industry/terminology customization for
  logged-in users) is unrelated and untouched — this dropdown is a marketing-page content switcher
  for anonymous visitors only.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Do NOT delete files yourself (e.g. do not attempt to remove `TutorHeroSection.tsx`,
  `TutorFeatureCarousel.tsx`, or `src/app/solutions/tutors/page.tsx`) — file deletion in L-3 is
  conductor-only via `git rm`. Only make the `next.config.ts` and `sitemap.ts` text edits from that
  task.
- Transcribe the plan's code exactly — every step's Create/Replace block in
  `docs/superpowers/plans/2026-07-21-unified-landing-page.md` is complete, real content.
- If any file doesn't match what the plan's step expects (e.g. content already changed), report it
  as a blocker with the exact text expected and what the file actually contains — do not guess.

## Rules for conductor (Claude)
- `pnpm run build` after each turn — must pass clean before ticking the box and committing.
- L-3's file deletions (`git rm src/app/solutions/tutors/page.tsx
  src/components/landing/TutorHeroSection.tsx src/components/landing/TutorFeatureCarousel.tsx`)
  are conductor-only; dispatch only the `next.config.ts` + `sitemap.ts` edits to Codex for that
  turn.
- Manual browser smoke test (dropdown switch, redirect check) happens after L-2 and L-3
  respectively — conductor runs `pnpm dev` and verifies directly since there's no test runner.

---

- [x] **L-1** — Industry content config module (plan Task 1, Codex, 1 new file:
  `src/lib/landing-industries.ts`).
- [x] **L-2** — Consolidate Hero/FeatureCarousel/Navbar into config-driven, dropdown-switchable
  `LandingExperience` (plan Task 2, Codex, 5 files: `HeroSection.tsx`/`FeatureCarousel.tsx`/
  `Navbar.tsx` rewrites, new `LandingExperience.tsx`, `src/app/page.tsx` edit).
  - Plan gap found during this turn's build verification: `src/app/solutions/tutors/page.tsx` also
    rendered the shared `Navbar` component (not just the Tutor-specific ones), so it broke once
    `Navbar` gained required props. Rather than leave the build red between turns, the conductor
    pulled L-3's file deletions (`src/app/solutions/tutors/page.tsx`,
    `TutorHeroSection.tsx`, `TutorFeatureCarousel.tsx`) forward into this turn's commit — that work
    was always conductor-only anyway, just resequenced. L-3 below is now scoped down to only the
    `next.config.ts` redirect + `sitemap.ts` edit.
- [x] **L-3** — Add the `/solutions/tutors` → `/` redirect and remove the sitemap entry (plan
  Task 3, Codex, 2 files: `next.config.ts`, `sitemap.ts` — the file deletions this task originally
  covered are already done, see L-2 note above).

## Acceptance checklist
- [x] `/` renders the general landing content by default (unchanged headline/copy from before this
  phase). Verified via Playwright browser snapshot.
- [x] The Navbar dropdown switches to "Tutors & tutoring businesses" and the Hero + FeatureCarousel
  content updates client-side (headline, value chips, stats, dashboard image, feature cards,
  showcase screens) while Pricing/Footer stay constant. Verified via Playwright browser snapshot,
  zero console errors.
- [x] `src/app/solutions/tutors/page.tsx` no longer exists (deleted during L-2, see note above).
- [x] Requesting `/solutions/tutors` returns a redirect to `/` — verified against a real production
  build (`pnpm run start`): `curl -D-` shows `HTTP/1.1 308 Permanent Redirect` with `location: /`
  (Next's App Router uses 308 for `permanent: true` redirects — same SEO-consolidation effect as
  a 301).
- [x] `src/app/sitemap.ts` no longer lists `/solutions/tutors` — verified against the real
  `/sitemap.xml` output of a production build: goes straight from the homepage `<loc>` to `/blog`.
- [x] Full `pnpm run build` passes clean after every code turn (required a `.next` cache clear
  once, after deleting the old route, to clear a stale generated type-validator file — not a code
  issue).
- [x] Manual: dropdown switch (general ↔ tutors) verified in a real browser.
- [x] Manual: `/solutions/tutors` → `/` redirect verified against a real production build (see
  above) — `Footer.tsx`'s "For tutors" link now works correctly again.

All checklist items and acceptance criteria complete. Phase done.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) for every code
turn, plus the two manual browser checks above (dropdown content swap, and the old-route redirect).
