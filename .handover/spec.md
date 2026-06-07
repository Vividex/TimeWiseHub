# Task: Redesign the startup splash — spinning TW coin on deep navy, "powered by vividex"

## Context
Replace the v1 text-wordmark splash with a branded animation. Next.js App Router;
client components need `"use client"`; SSR-safe (no `window`/`document` during
render). `SplashGate` is already wired into `src/app/layout.tsx` (wraps the app,
shows once per full page load); this task rewrites the splash internals — keep the
`SplashScreen` props `{ minDurationMs?: number; onDone?: () => void }` and the
`SplashGate` show-once behavior intact.

Design decisions (locked):
- **Background:** a FIXED deep navy `#020617` (the scheme's darkest), NOT a theme
  variable — the splash is a brand moment, identical in light/dark mode.
- **Centerpiece:** the circular TW logo (served at `/logo.png`) presented as a
  **two-sided coin** and animated to **spin on its vertical axis like a coin
  spinning on its edge**, decelerating to rest **facing forward**, then static.
- **Attribution:** small "powered by" + the **vividex** mark (the blue V +
  "VIVIDEX" wordmark) below the logo. The source asset `vividex logo 3.png` has a
  black background and a "BUILDING DIGITAL EXPERIENCES" tagline; both must be
  removed — black via CSS `mix-blend-mode: screen` (drops black on the navy bg),
  tagline via a clipping container showing only the V + wordmark.
- **No new dependencies.** Pure CSS keyframes for the animation (GPU-friendly).

## Acceptance checklist
- [ ] C1: Make the vividex asset web-accessible — copy the repo-root `vividex logo 3.png` to `public/vividex.png` (so it serves at `/vividex.png`). Do not modify the original.
- [ ] C2: Rewrite `src/components/SplashScreen.tsx` structure (`"use client"`): a `fixed inset-0 z-50` full-screen flex-centered overlay with an INLINE fixed background `#020617` (not a theme var). Center a TW "coin": a container with CSS `perspective`, holding two stacked `<img src="/logo.png">` faces — front at `rotateY(0)` and back at `rotateY(180deg)`, both with `backface-visibility: hidden` — so both faces show the TW logo and there is never a mirrored/backwards flash. Keep props `{ minDurationMs?: number; onDone?: () => void }`. SSR-safe. (No spin animation yet — static coin facing front.)
- [ ] C3: Add the coin spin via pure CSS `@keyframes` that rotate the coin container about the Y axis through multiple turns and **ease-out decelerate** to land exactly face-front (`rotateY(0)` / a multiple of 360deg), duration ~1.6s, `forwards` fill so it holds static facing forward after. No JS animation libs.
- [ ] C4: Add the "powered by vividex" mark below the coin: small muted "powered by" text (slate, e.g. `#64748b`) above/beside `<img src="/vividex.png">` rendered with `mix-blend-mode: screen` (so the black background disappears on the navy) inside a clipping container (`overflow: hidden` + sized/positioned to show only the V + "VIVIDEX", cropping off the "BUILDING DIGITAL EXPERIENCES" tagline). Keep it small and understated.
- [ ] C5: Lifecycle/timing — after the spin settles (~1.6s) keep the logo static for at least 1s, then fade the whole overlay out (opacity transition ~0.4s) and call `onDone` when the fade completes (reuse the `onTransitionEnd` pattern). Total ≈3s. Honor `minDurationMs` as the floor for the static hold. SSR-safe (timers/effects only).

## Verification
- Global (after each item): `npm run lint` reports no new errors and
  `npx tsc --noEmit` reports no type errors in the changed files.
- Per item: Claude inspects the actual `git diff` and confirms it matches the
  description — `"use client"` present, fixed `#020617` background, double-sided
  coin with `backface-visibility: hidden`, CSS-only spin easing to face-front,
  vividex via `mix-blend-mode: screen` + tagline cropped, SSR-safe lifecycle, no
  new dependencies.
- Final (manual, after the loop): visual check via the dev server — the coin
  spins, settles forward, holds ~1s, then the app appears; "powered by vividex"
  is clean (no black box, no tagline).

## Out of scope
- No new npm dependencies. No backend/Supabase/Stripe/auth/billing changes.
- Do not alter `src/app/layout.tsx`'s existing `SplashGate` wiring or other
  components beyond `SplashScreen.tsx` / `SplashGate.tsx`.
- No paid asset generation or external calls (spend budget is 0).
- Do not edit the original `vividex logo 3.png` or the TW `/logo.png`.
