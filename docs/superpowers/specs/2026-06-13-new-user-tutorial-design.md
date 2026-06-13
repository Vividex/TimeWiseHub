# New User Tutorial — Design Spec
_2026-06-13_

## Goal

Give new users a smooth, guided introduction to TimeWiseHub immediately after signing up. The tutorial must respect user autonomy (skip at any time), teach through real interaction (not simulated clicks), and end with a tips screen covering lesser-used features — so users leave knowing what the app can do without being dragged through every corner of it.

---

## Scope

- Welcome modal on first dashboard load (skip or start)
- Spotlight-driven guided tour with blocked navigation
- Bouncing arrow + explanation card per step
- Role-aware step paths (owner/admin vs employee)
- Tips screen at the end
- Persistent dismissal state in Supabase

---

## Architecture

### `TutorialProvider`

A React context wrapping the dashboard layout (`src/app/dashboard/layout.tsx`). State:

```ts
type TutorialState = {
  active: boolean
  step: number       // 0 = welcome modal, 1–N = tour steps, N+1 = tips screen
  total: number
  advance: () => void
  skip: () => void
}
```

On mount, the provider checks Supabase for a `user_onboarding_dismissed` row. If none exists and the user's `organisation_members.created_at` is within 30 days, `active` starts `true` at step 0 (welcome modal).

### `TutorialOverlay`

A fixed full-screen dark backdrop at `z-50`. The currently targeted element receives `z-60` and a CSS `box-shadow` ring to punch through the overlay. Positioning uses `getBoundingClientRect()` on the element identified by `data-tutorial="<step-id>"` attributes.

Blocked navigation: while the tour is active, all sidebar links that are not the current target receive `pointer-events: none` and reduced opacity via a context-driven className.

### Bouncing arrow

Pure CSS `@keyframes` animation positioned absolutely relative to the target element's bounding rect. No third-party library.

### Explanation card

A small floating card auto-positioned adjacent to the target, with collision detection to avoid screen edges. Contains: heading, body text, step counter ("3 of 6"), and a "Next" button for users who want to advance without interacting.

### Steps config

A plain array in `src/lib/tutorial-steps.ts`:

```ts
type TutorialStep = {
  id: string
  target: string        // data-tutorial attribute value
  heading: string
  body: string
  roles: ('owner' | 'admin' | 'manager' | 'employee')[]
}
```

### Dismissal

Completing the tour OR clicking skip at any point writes a row to `user_onboarding_dismissed`. The provider checks this on mount — once written, the tutorial never shows again.

### New table

```sql
user_onboarding_dismissed (
  user_id     uuid references auth.users primary key,
  org_id      uuid references organisations,
  dismissed_at timestamptz default now()
)
```

RLS: users can only read/write their own row.

### "New user" window

Tutorial is eligible for users whose `organisation_members.created_at` is within 30 days AND no `user_onboarding_dismissed` row exists. After 30 days the tutorial auto-expires — it will never show a long-tenured user who skipped setup.

---

## Tour Steps

### Welcome modal (step 0)

Full overlay, no spotlight target.

> **Welcome to TimeWiseHub**
> Let's show you around — takes about 2 minutes.
>
> `[ Show me around ]`   `[ Skip for now ]`

---

### Owner / Admin / Manager path (6 steps)

| Step | `data-tutorial` target | Heading | Body |
|---|---|---|---|
| 1 | `home` | Your home base | Everything important surfaces here — your tasks, upcoming shifts, and what needs attention today. |
| 2 | `clients` | Your clients | Add clients first. Time entries, invoices, projects, and sessions all link back to a client. |
| 3 | `time` | Tracking time | Start the timer when you begin work, or log time manually. Entries attach to a client and project. |
| 4 | `roster` | Scheduling your team | Build the week's roster here. Hit Publish and your team gets notified instantly. |
| 5 | `assistant` | Your AI assistant | Ask it anything — "how many hours did I log this week?", "draft an invoice for Acme". It knows your data. |
| 6 | `chat` | Team chat | Message your team without leaving the app. Respects quiet hours — no pings outside work time. |

### Employee path (4 steps)

| Step | `data-tutorial` target | Heading | Body |
|---|---|---|---|
| 1 | `home` | Your home base | Everything important surfaces here — your tasks, upcoming shifts, and what needs attention today. |
| 2 | `time` | Tracking time | Start the timer when you begin work, or log time manually. Your manager can see your entries. |
| 3 | `roster` | Your roster | See when you're scheduled to work. You'll get a notification whenever a new roster is published. |
| 4 | `chat` | Team chat | Message your team without leaving the app. Respects quiet hours — no pings outside work time. |

---

## Tips Screen (final step)

Full overlay card, no spotlight target.

**Heading:** A few things worth knowing

| Tip | Content |
|---|---|
| Quiet hours | Set your working hours in Settings. Chat notifications won't interrupt you outside them. |
| Expense export | Log expenses as you go, then export a CSV for your accountant at tax time. |
| Insights | See billable vs non-billable time, project health, and team activity at a glance. |
| Payslips | Your payslips are stored in Finance → Payslips, always accessible. |
| Leave balances | Request leave and track your balance under People → Leave. |

**CTA:** `[ Let's go ]` — dismisses overlay, writes `user_onboarding_dismissed`, lands user on home dashboard.

---

## `data-tutorial` attribute placement

The following nav items in `SidebarNav.tsx` need `data-tutorial` attributes added:

| Attribute value | Nav item |
|---|---|
| `home` | Home (`/dashboard`) |
| `clients` | Clients (`/dashboard/clients`) |
| `time` | Time (`/dashboard/time`) |
| `roster` | Roster (`/dashboard/roster`) — new, from HR depth spec |
| `assistant` | Assistant (`/dashboard/assistant`) |
| `chat` | Chat (`/dashboard/chat`) |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| User refreshes mid-tour | Tour restarts at the welcome modal (only dismissed/not-dismissed is persisted — step number is in-memory only) |
| User is on mobile | Overlay and arrow still render; sidebar is the mobile drawer version — same `data-tutorial` attributes apply |
| User skips at any step | Writes `user_onboarding_dismissed` immediately; full UI unlocked |
| Employee has no roster yet | Step 3 (roster) still highlights the nav item and explains what it will show — no dependency on data existing |
| Tour shown to org owner with no team | Steps still valid — the tour teaches the UI, not the data |

---

## Out of Scope (this phase)

- Re-triggerable tutorial (Settings option to replay)
- Feature-specific sub-tours (e.g. a roster-specific walkthrough)
- Video embeds within tour steps (covered by the separate landing page video showcase spec, deferred)
