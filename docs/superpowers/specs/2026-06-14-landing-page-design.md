# Landing Page — Design Spec

**Goal:** A public-facing marketing page at `/` showcasing TimeWiseHub's full feature breadth to
visitors who are not yet logged in. Authenticated users are immediately redirected to `/dashboard`.
The page communicates product value through an auto-advancing feature carousel and closes with a
pricing section. Zero new dependencies.

---

## Architecture

RSC shell with one client island. `src/app/page.tsx` is the entry point — it checks the Supabase
session server-side and redirects authenticated users to `/dashboard`. All sections except
`FeatureCarousel` are server components (zero JS payload for those sections).

---

## Components

All new, under `src/components/landing/`.

### `Navbar.tsx` (server)
Logo on the left. "Log in" and "Get started free" buttons on the right. Links to `/login` and
`/signup` respectively. Sticky at the top of the page.

### `HeroSection.tsx` (server)
Full-viewport opening panel. Large headline communicating broad value (e.g. "Everything your team
needs, in one place"), one-line subheadline, single "Get started free" CTA button linking to
`/signup`. No background image — styled with Tailwind gradients.

### `FeatureCarousel.tsx` (`'use client'`)
Auto-advances every 4 seconds. Pauses on hover. Eight slides covering the full product breadth:

1. Rostering / Scheduling
2. Timesheets
3. Payroll
4. Team Chat (channels, DMs, groups)
5. Tasks / Project Tracking
6. Finance / Invoicing / P&L
7. HR Profiles, Certifications & Onboarding
8. AI Assistant

Each slide contains: feature title, two-line description, and a stylised Tailwind `<div>` mockup
representing that feature's UI (not a real screenshot — designed to look like the app). A dot-row
at the bottom shows the active slide and allows click-to-jump navigation.

### `PricingSection.tsx` (server)
Three cards: Free, Pro, Business. Labels and feature lists pulled directly from `src/lib/stripe.ts`
constants so they stay in sync with billing. Each card has a "Get started free" CTA.

### `Footer.tsx` (server)
Product name, links to `/terms` and `/privacy`, copyright line.

---

## Data

No new database tables. Pricing data pulled from existing `src/lib/stripe.ts` exports.

---

## Auth Redirect

`src/app/page.tsx` calls `createClient()` from `@supabase/ssr`, checks the session, and calls
`redirect('/dashboard')` if the user is authenticated. Otherwise renders the landing page.

---

## No New Dependencies

Auto-advance uses `useEffect` + `setInterval`. Mockup UI blocks are pure Tailwind. No animation
libraries required.
