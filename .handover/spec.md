# Task: Global back button (never-a-dead-end navigation)

## Context
The desktop (Tauri) app loads the live web app in a chrome-less window
(`src-tauri/tauri.conf.json` → `url: https://timewisehub.com.au`), so there is NO
browser back button, and some pages have no in-app way back — users get stuck and
must quit and relaunch. Fix: a single GLOBAL back control in the web app (covers
web, desktop, PWA — all the same app). Next.js App Router; client components need
`"use client"`; SSR-safe. `lucide-react` is already a dependency (use it for the
icon — no new deps). The root layout already wraps the app in `ThemeProvider` and
`SplashGate` (`src/app/layout.tsx`); add the new pieces without disturbing those.

Design decisions (locked):
- **Global, app-wide, top-left**, rendered once in the root layout (covers every
  page: dashboard, settings, help, onboarding, legal, etc.).
- **Behavior:** click → go back if there is in-app history this session, else fall
  back to `/dashboard` (home). Never a dead end.
- **Auto-hide** on root/entry routes where "back" is meaningless: `/`,
  `/dashboard`, `/login`, `/onboarding`.
- **"Can go back" signal:** a small provider tracks whether the user has navigated
  within the app this session (App Router has no built-in API; `window.history.length`
  is unreliable). Navigated at least once → `router.back()` is safe; cold landing
  on a deep page (redirect/deep-link) → home fallback.
- Fixed floating placement so it is decoupled from each page's own header/layout.

## Acceptance checklist
- [ ] C1: Create `src/components/NavHistoryProvider.tsx` — a `"use client"` React context provider wrapping `children`. Using `usePathname()`, track in-app navigation: skip the initial mount, then on each subsequent pathname change mark that the user has navigated this session. Expose a context value `{ canGoBack: boolean }` (true once at least one in-app navigation has happened). SSR-safe (no `window` access during render). Export the provider and a `useNavHistory()` hook.
- [ ] C2: Create `src/components/BackButton.tsx` — a `"use client"` component that consumes `useNavHistory()` and `usePathname()`/`useRouter()`. Render a FIXED-position control top-left (e.g. `position: fixed; top: 12px; left: 12px; z-index: 50`) — a `lucide-react` `ChevronLeft` icon + "Back" label, as a real accessible `<button>` (`aria-label="Go back"`), styled to match the app (rounded, subtle background, cyan accent, readable in light/dark). On click: if `canGoBack` call `router.back()`, else `router.push('/dashboard')`. Return `null` (render nothing) when `usePathname()` is one of the root routes `['/', '/dashboard', '/login', '/onboarding']`. SSR-safe.
- [ ] C3: Wire into `src/app/layout.tsx` — wrap the existing app content in `NavHistoryProvider` and render `<BackButton />` once inside it (within `<body>`, alongside the current `ThemeProvider`/`SplashGate` tree). Do not remove or alter the existing `SplashGate`/`ThemeProvider`/`ServiceWorkerRegistration`/`CookieBanner` wiring.

## Verification
- Global (after each item): `npm run lint` reports no new errors and
  `npx tsc --noEmit` reports no type errors in the changed files.
- Per item: Claude inspects the actual `git diff` and confirms it matches the
  description — `"use client"` present, SSR-safe, no new dependencies, correct
  back/home-fallback logic, correct root-route hiding, fixed top-left placement.
- Final (manual, after the loop): visual check via the dev server — the button
  shows on inner pages (e.g. /settings, /help), is hidden on `/dashboard`, does
  NOT collide with the dashboard header, and going back / home-fallback both work.

## Out of scope
- No new npm dependencies (use the existing `lucide-react`).
- No backend/Supabase/Stripe/auth/billing changes.
- Do not change pages other than `src/app/layout.tsx`, and do not modify other
  components. No pricing/plan changes (that is a separate task).
- Wiring the desktop mouse "back" button is a separate, optional follow-up — not
  part of this task.
