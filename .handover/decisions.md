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
- Do not add npm dependencies — use what is already installed.
- Confine changes to: src/components/SplashScreen.tsx, src/components/SplashGate.tsx,
  and a new public/vividex.png. Leave the existing SplashGate wiring in
  src/app/layout.tsx as-is; do not touch other components or page.tsx.
- Do not edit the original "vividex logo 3.png" or public/logo.png.
