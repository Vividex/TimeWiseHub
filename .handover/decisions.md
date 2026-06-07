# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
# Machine-read budget: total USD the loop may spend on paid actions this run.
# This task needs ZERO spend, so keep it at 0 — any attempted spend should pause.
- spend-budget-usd: 0
# Human notes about spending (free-form, for your reference):
- This is a UI-only task; no paid actions expected.

## Notes
# Free-form standing rules the conductor should respect this run.
- Never touch billing, payment, auth, or Supabase code.
- Do not add npm dependencies — use the existing lucide-react for the icon.
- Confine changes to: new src/components/NavHistoryProvider.tsx, new
  src/components/BackButton.tsx, and src/app/layout.tsx (wiring only).
- Leave the existing SplashGate/ThemeProvider/ServiceWorkerRegistration/CookieBanner
  wiring intact; do not modify other components or pages.
