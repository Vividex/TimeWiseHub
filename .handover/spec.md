# Task: Add a branded startup splash screen component

## Context
TimeWiseHub is a Next.js **App Router** app. Pages/layout live in `src/app/`;
reusable components live in `src/components/` as PascalCase `.tsx` files. Client
components must start with `"use client"`. The app uses `next-themes` for
light/dark (theme tokens are CSS variables in `src/app/globals.css`),
`lucide-react` for icons, and Poppins/Inter fonts via `@fontsource`. It also ships
as a Tauri desktop app, so a startup splash is genuinely useful. Build with the
EXISTING dependencies only — do not add packages. Everything must stay SSR-safe
(no `window`/`document` access during render).

## Acceptance checklist
- [ ] C1: Create `src/components/SplashScreen.tsx` — a `"use client"` full-screen overlay (`fixed inset-0`, high z-index, centered) showing the "TimeWiseHub" wordmark (Poppins) and a subtle animated loading indicator using a `lucide-react` icon (e.g. `Loader2` with a CSS spin). It must respect light/dark via the existing theme CSS variables. Default-export a `SplashScreen` component accepting props `{ minDurationMs?: number; onDone?: () => void }`.
- [ ] C2: Implement auto-dismiss in `SplashScreen.tsx`: on mount, after `minDurationMs` (default 1500ms) start a CSS opacity fade-out, and call `onDone` once the fade finishes. Use `useState`/`useEffect`; keep it SSR-safe (guard browser access inside effects only).
- [ ] C3: Create `src/components/SplashGate.tsx` — a `"use client"` wrapper that shows `SplashScreen` on first client mount, then renders its `children`, hiding the splash when `onDone` fires. Do NOT modify `layout.tsx` or `page.tsx` in this task; just provide the reusable gate component for later wiring.

## Verification
- Global (run after each item): `npm run lint` reports no new errors, and
  `npx tsc --noEmit` reports no type errors in the new files.
- Per item: Claude inspects the actual `git diff` and confirms the component
  matches the description — `"use client"` present, SSR-safe, no new dependencies,
  uses `lucide-react` + existing fonts/theme variables.

## Out of scope
- Do NOT modify `src/app/layout.tsx` or `src/app/page.tsx` (wiring happens later).
- No new npm dependencies. No backend/Supabase/Stripe/auth/billing changes.
- No changes to existing components. No image/video/asset generation (no spend).
