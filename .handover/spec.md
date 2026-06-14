# Phase 22 — Landing Page

## Goal
Build a public-facing marketing page at `/` with a sticky navbar, full-viewport
hero, auto-advancing feature carousel (8 slides), pricing cards, and footer.
Authenticated users are redirected to `/dashboard`.

## Source plan
`docs/superpowers/plans/2026-06-14-landing-page.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-landing-page-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.tsx).
- **Conductor**: runs `pnpm run build`; commits; any shell commands.

## Acceptance checklist

### Task 1 — Static layout components
- [x] C1-1: Create `src/components/landing/Navbar.tsx` (exact code in plan Task 1 Step C1-1)
- [x] C1-2: Create `src/components/landing/HeroSection.tsx` (exact code in plan Task 1 Step C1-2)
- [x] C1-3: Create `src/components/landing/Footer.tsx` (exact code in plan Task 1 Step C1-3)
- [x] C1-4: [CONDUCTOR] Commit

### Task 2 — FeatureCarousel
- [ ] C2-1: Create `src/components/landing/FeatureCarousel.tsx` (exact code in plan Task 2 Step C2-1)
- [ ] C2-2: [CONDUCTOR] Commit

### Task 3 — PricingSection
- [ ] C3-1: Create `src/components/landing/PricingSection.tsx` (exact code in plan Task 3 Step C3-1)
- [ ] C3-2: [CONDUCTOR] Commit

### Task 4 — Wire page.tsx + build gate
- [ ] C4-1: Replace `src/app/page.tsx` (exact code in plan Task 4 Step C4-1)
- [ ] C4-2: [CONDUCTOR] `pnpm run build` — must pass clean
- [ ] C4-3: [CONDUCTOR] Commit

## Verification
`pnpm run build` must pass clean after Task 4.

Manual smoke after C4-3:
- Visit `/` while logged out → landing page renders (navbar, hero, carousel, pricing, footer)
- Auto-advance cycles through 8 slides; hover pauses it; dot nav jumps to slide
- "Get started free" → `/register`; "Log in" → `/login`
- Visit `/` while logged in → redirects to `/dashboard`
- Pricing cards show Free $0, Pro $12, Business $29
