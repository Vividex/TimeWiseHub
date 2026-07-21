# Unified Landing Page — Design Spec

## Problem

There are currently two near-identical landing pages: `/` (general) and
`/solutions/tutors`. Both share the same visual shell (Navbar, Hero,
FeatureCarousel, PricingSection, Footer) and differ only in copy/images. Both
are indexed by Google and show up side by side for a "timewisehub" search,
which is confusing to read through and will get worse as more
industry-specific pages are added per the Workspace Profile roadmap (trades,
cleaning, real estate).

## Goal

Consolidate to a single URL (`/`) with a dropdown that lets a visitor pick
their business type and see tailored hero/feature content, without a page
reload or a second indexed URL.

## Architecture

`src/app/page.tsx` stays a server component (keeps the existing
`supabase.auth.getUser()` → redirect-to-dashboard check), but renders a new
client component, `LandingExperience`, which owns the interactive landing UI.

```
page.tsx (server)
└── LandingExperience (client, useState<IndustryId>('general'))
    ├── Navbar (client — dropdown lives here, calls back up on change)
    ├── HeroSection (industry: IndustryContent)
    ├── FeatureCarousel (industry: IndustryContent)
    ├── PricingSection (unchanged, industry-agnostic)
    └── Footer (unchanged, industry-agnostic)
```

The selected industry is **in-page state only** — it does not update the URL
or a query param. A refresh resets to `general`. This was a deliberate choice:
there's no current need (ad campaigns, targeted links) that would justify the
added complexity of URL state, and keeping the URL static removes any risk of
Google indexing a second variant. If a future need for shareable per-industry
links arises, this can be revisited (adding a query param + `rel=canonical`
back to `/` + keeping it out of the sitemap would be the safe way to do it).

`Navbar` currently has no client-side interactivity; it becomes a client
component so the dropdown can live there.

## Data model

Both existing Hero components (`HeroSection` / `TutorHeroSection`) and both
FeatureCarousel components (`FeatureCarousel` / `TutorFeatureCarousel`) are
structurally identical — only text content, image imports, and list lengths
differ. This is consolidated into a single config:

```ts
// src/lib/landing-industries.ts
export type IndustryId = 'general' | 'tutors'

export interface IndustryContent {
  id: IndustryId
  dropdownLabel: string
  badge: string
  headline: string
  subheadline: string
  valueItems: string[]
  stats: { label: string; value: string }[]
  dashboardImage: StaticImageData
  dashboardImageAlt: string
  screens: { label: string; image: StaticImageData; alt: string }[]
  featureCards: { title: string; body: string; href?: string }[]
  featureCarouselHeading: string
}

export const INDUSTRIES: Record<IndustryId, IndustryContent>
```

`HeroSection` and `FeatureCarousel` become `{ industry: IndustryContent }`
prop-driven components (same JSX shell, reading from the prop instead of
hardcoded constants). `TutorHeroSection.tsx` and `TutorFeatureCarousel.tsx`
are deleted; their content is folded into the `tutors` entry in
`INDUSTRIES`.

Adding a future industry (trades, cleaning, real estate) becomes: add one new
`IndustryContent` entry — no new component files.

## Old route & SEO cleanup

- `src/app/solutions/tutors/page.tsx` is deleted.
- A permanent redirect is added in `next.config.ts` (`redirects()`):
  `/solutions/tutors` → `/` (301), so any existing ranking/backlink signal
  consolidates onto `/` instead of 404ing or lingering as a duplicate.
- `src/app/sitemap.ts` drops the `/solutions/tutors` entry.

## Scope

**In scope:** `general` and `tutors` industry entries — the two that exist
today.

**Explicitly out of scope:** placeholder entries for trades, cleaning, or
real estate. That marketing copy doesn't exist yet (per the Workspace Profile
roadmap, those are unspecced), so stubbing them now would be premature and
likely thrown away once those get designed properly.

**Not touched:** the dashboard's "Workspace Profile" system (per-account
industry/terminology customization for logged-in users) is unrelated — this
dropdown is a marketing-page content switcher for anonymous visitors only,
with no connection to auth or account data.

## Verification

No test runner in this project — verify via:

- `pnpm run build` passes clean (tsc + eslint)
- Manual smoke: load `/`, confirm `general` content renders by default;
  switch the dropdown to "Tutors," confirm Hero + FeatureCarousel swap
  correctly while Pricing/Footer stay constant; refresh and confirm it
  resets to `general` (expected — state isn't persisted)
- Confirm `/solutions/tutors` redirects to `/` (301)
- Confirm the sitemap output only lists `/` for the landing experience, not
  the old solutions URL
