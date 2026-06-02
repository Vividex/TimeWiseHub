# TimeWiseHub — Tech Stack Reference

## Decision Date: 2026-06-01

---

## Stack Overview

| Layer | Tool | Version Target | Hosting |
|---|---|---|---|
| Language | TypeScript | 5.x | — |
| Frontend Framework | Next.js | 14+ (App Router) | Vercel |
| Styling | Tailwind CSS | 3.x | — |
| UI Components | shadcn/ui (Radix UI base) | latest | — |
| Database | PostgreSQL (via Supabase) | 15+ | Supabase |
| Auth | Supabase Auth | — | Supabase |
| File Storage | Supabase Storage | — | Supabase |
| Real-time | Supabase Realtime | — | Supabase |
| Payments | Stripe | — | Stripe |
| Mobile (later) | Capacitor | 6.x | App stores |
| Desktop (later) | Tauri | 2.x | Direct / Store |

---

## Why This Stack

### Next.js + Vercel
- React-based — vast ecosystem, large hiring pool
- App Router supports server components, reducing client-side JS
- Vercel deploys on every git push; preview URLs for every branch
- Free tier covers early-stage traffic comfortably
- Same codebase becomes the mobile web app and wraps into Capacitor later

### Supabase
- Single provider for four critical services: database, auth, file storage, and real-time
- Row Level Security (RLS) enforces org/employee data isolation at the database level
- Supabase Realtime uses PostgreSQL replication under the hood — live timers and push notifications without a separate WebSocket server
- Free tier: 500 MB database, 1 GB storage, 50,000 monthly active users
- Open source — can self-host if ever needed

### Stripe
- Industry standard for SaaS subscription billing
- Handles: subscription creation, per-seat billing, trial periods, invoices, failed payment retries (dunning), customer portal
- Stripe webhooks integrate cleanly with Supabase Edge Functions or Next.js API routes

### TypeScript (end-to-end)
- Single language across frontend and backend/API routes
- Shared types between client and server reduce bugs at API boundaries
- Supabase auto-generates TypeScript types from the database schema

---

## Architecture Overview

```
[Browser / Mobile WebView]
        |
   Next.js (Vercel)
   - Pages & UI
   - API Routes (server-side logic, Stripe webhooks)
        |
   Supabase
   - PostgreSQL (all app data)
   - Auth (JWT, sessions, RLS)
   - Storage (receipts, attachments)
   - Realtime (live timers, notifications)
        |
   Stripe
   - Subscriptions, billing, invoices
```

---

## Real-time Design

Supabase Realtime will be used for:
- **Live timers** — broadcast timer state so manager dashboards update without polling
- **Notifications** — task focus prompts, idle alerts pushed to the active session

Implementation approach: Supabase Realtime channels (Broadcast for ephemeral events like timer ticks; Postgres Changes for persistent state like task updates).

---

## Data Isolation Strategy

Supabase Row Level Security (RLS) policies will enforce that:
- An employee can only read/write their own records
- An org admin can read records belonging to their organisation
- No cross-organisation data is ever returned by the API

This is enforced at the database layer, not just the application layer.

---

## Mobile Strategy (Phase 9)

1. Ensure the Next.js web app is fully responsive (Tailwind handles this from day one)
2. Wrap with **Capacitor** — generates an Android APK and iOS IPA from the web build
3. Capacitor plugins provide native access to: camera (receipt capture), push notifications, file system
4. No full rewrite required — the web app IS the mobile app

## Desktop Strategy (Phase 9)

- **Tauri** wraps the Next.js web app into a lightweight Windows (and optionally macOS/Linux) executable
- Much smaller binary than Electron; uses the OS WebView rather than bundling Chromium

---

## Subscription Tiers (Provisional — confirm before Phase 8)

| Tier | Target | Key Limits |
|---|---|---|
| Free | Individuals | 1 user, 30 days history, 10 receipt uploads/month |
| Pro | Individuals | Unlimited history, unlimited receipts, insights |
| Team | Small orgs | Up to 10 seats, manager dashboard, expense approvals |
| Business | Larger orgs | Unlimited seats, audit logs, priority support |

---

## Local Dev Setup (to be documented in Phase 1.7)

Required tools:
- Node.js 20+
- pnpm (preferred over npm for monorepo)
- Supabase CLI (local Supabase instance for dev)
- Stripe CLI (webhook forwarding for local testing)
- Git

---

## Key Constraints & Decisions

- **No separate backend server** — Next.js API routes + Supabase Edge Functions replace a standalone Express/FastAPI server, reducing infrastructure overhead
- **Supabase over Firebase** — relational data model suits this product; RLS is cleaner for multi-tenant isolation than Firestore rules
- **Capacitor over React Native** — avoids maintaining a separate codebase; acceptable for this product type (not a graphics-heavy app)
- **Stripe over Paddle** — better docs, wider integrations, stronger TypeScript support
