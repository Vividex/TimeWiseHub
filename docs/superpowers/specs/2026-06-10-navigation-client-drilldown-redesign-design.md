# Navigation & Client Drill-Down Redesign

## Goal
Replace the current "patch on patch" navigation with a coherent, client-centred
information architecture. Clients become the spine of the app: you drill from
Clients → a Client → its Projects / Sessions / Notes → a Project → its Tasks,
with every collection rendered through one shared tile component. The sidebar is
reorganised and trimmed via a full audit, and mobile navigation switches from a
horizontal scroll strip to a hamburger-triggered slide-in of the real sidebar.

## Source of decisions
Brainstormed 2026-06-10. Key choices made by the user:
- **Client-only hierarchy** — Projects and Tasks are reached through Clients, not
  as standalone sidebar items. Data confirms this is already true (0 client-less
  projects, 0 project-less tasks). Client-on-project is treated as required going
  forward; an "Internal" client covers any future client-less work.
- **Category-tile (folder) client home** — opening a client shows big category
  tiles (Projects · N, Sessions · N, Notes · N); you click a category to reach
  the grid of items.
- **Task tile → slide-over drawer** — no dedicated task route; clicking a task
  tile opens a slide-over panel to view/edit, keeping you in the task grid.
- **Full sidebar audit** — regroup, promote Clients, and merge the redundant
  analytics pages.
- **Mobile drawer** — replace the top horizontal scroll nav with a hamburger
  button that slides the desktop sidebar into view.

## Non-goals
- No changes to auth, billing/Stripe, or RLS policies.
- No new database tables or columns. (Projects/tasks already carry the needed
  foreign keys.)
- No redesign of the *internals* of pages that merely move or get regrouped
  (Time, Chat, Assistant, Calendar, Leave, Expenses, Invoices, Finance keep
  their current page bodies).
- No real-time/subscription changes.
- No task comments/subtasks/attachments (the drawer is deliberately sized to the
  current light task model; promoting it to a page later is a clean refactor).

---

## A. Information architecture (new sidebar)

```
HOME
  • Home              repurposed "My Work": my tasks across all clients,
                      today's time, upcoming sessions; managers also get the
                      unassigned task pool + assign. Absorbs the old /tasks hub.

DELIVERY
  • Clients           the hub — Client ▸ Projects ▸ Tasks / Sessions / Notes
  • Calendar
  • Time

COMMUNICATION
  • Chat
  • Assistant

MONEY
  • Invoices
  • Expenses
  • Finance           role-based P&L

PEOPLE
  • Leave

INSIGHTS
  • Insights          merged: Overview (charts) + Activity (feed) + Export
                      (old Reports), as tabs within one page.

BOTTOM
  • Billing · Settings · Help · Download
```

**Audit outcome — what changed and why:**
- **Clients promoted** out of Finance to anchor a *Delivery* group.
- **Projects & Tasks removed** as nav items: project/task browsing lives under
  Clients; cross-cutting "my tasks / unassigned pool" moves to **Home**.
- **Insights + Reports + Activity merged** into one tabbed **Insights** page —
  three views of the same time/expense/task data collapsed into one.
- **Finance vs Invoices kept separate** — accounting P&L vs invoice records are
  genuinely different layers.
- **Chat vs Assistant kept separate** — sync messaging vs AI actions are
  different mental models.

---

## B. Routes (client-only hierarchy with nested URLs)

```
/dashboard                                      Home — "My Work" (see §E)
/dashboard/clients                              grid of CLIENT tiles
/dashboard/clients/[id]                         client home: CATEGORY tiles
/dashboard/clients/[id]/projects                grid of PROJECT tiles (+ New project)
/dashboard/clients/[id]/projects/[projectId]    project home: grid of TASK tiles
                                                  task tile → drawer (no route)
/dashboard/clients/[id]/sessions                grid of SESSION tiles (+ New session)
/dashboard/clients/[id]/sessions/[sessionId]    session detail (EXISTS — unchanged)
/dashboard/clients/[id]/notes                   progress-notes feed (+ add note)
```

**Retired routes:**
- `/dashboard/projects/[id]` → **server redirect** to
  `/dashboard/clients/[clientId]/projects/[id]` (look up the project's
  `client_id`, 308 redirect). Keeps calendar links and bookmarks working.
- `/dashboard/projects` (list) → **removed**; "New project" lives on the client's
  Projects view. Any link to it redirects to `/dashboard/clients`.
- `/dashboard/tasks` (hub) → **removed**; its unassigned-pool + my-tasks function
  moves to Home. Any link redirects to `/dashboard`.
- `/dashboard/reports`, `/dashboard/activity` → **removed** as standalone routes;
  their content becomes tabs on `/dashboard/insights`. Both redirect to
  `/dashboard/insights` (optionally with a `?tab=` query).

---

## C. Shared tile component

A single primitive pair used by **every** grid in the app — this is the core of
"coherent, not patchy".

**`<Tile>`** props:
- `accent?: string` — colour (project colour, category colour) used for the icon
  chip / left accent.
- `icon?: LucideIcon` — optional leading icon.
- `title: string`
- `meta?: string` — secondary line (date/time, contact, count).
- `stat?: string | number` — optional large figure (e.g. category count).
- `progress?: { done: number; total: number }` — renders an x/y label + thin bar.
- `badge?: { label: string; tone: 'blue' | 'amber' | 'green' | 'gray' | 'red' }`.
- `href?: string` **or** `onClick?: () => void` — drill in vs open drawer.

Visual contract: `rounded-2xl border bg-white shadow-sm`, consistent hover
(`hover:border-cyan-200 hover:bg-cyan-50`), dark-mode variants, full keyboard/focus
support. When `href` is set it renders as a `next/link`; when `onClick` is set it
renders as a `button`.

**`<TileGrid>`** wrapper: responsive grid, `grid-cols-2 sm:grid-cols-3
lg:grid-cols-4 gap-4`, with an optional `columns` override and an empty-state
slot.

**Consumers:**
| Grid | Tile content |
|------|--------------|
| Client tiles | name; email/phone meta; admin: outstanding badge |
| Category tiles | icon + label + count stat (Projects · 4) |
| Project tiles | name; project colour accent; task `progress`; due-date meta |
| Session tiles | title; datetime meta; status badge; todo `progress` |
| Task tiles | title; status badge; priority/due meta; `onClick` → drawer |
| Home cards | reuse Tile for the My-Work summary cards |

---

## D. Task drawer

A self-contained slide-over panel, opened from a task tile, edits one task in
place over the project's task grid. Same interaction family as the existing
`NewSessionModal`.

- Shows/edits: title, notes, priority, due date, assignee, status.
- Saves via the existing tasks update path (Supabase `tasks` update); on save it
  refreshes the grid (`router.refresh()`), no full navigation.
- Open/close is local component state; closing returns focus to the originating
  tile. No route, no URL change.
- One job, reusable: the drawer takes a `task` + `onClose` and is agnostic to
  where it was opened from, so it can later be reused outside the project grid.

---

## E. Home — "My Work"

The current Home is near-empty (greeting + quick links). It is repurposed to earn
its place and absorb the retired `/dashboard/tasks` hub.

- **My tasks** — tasks assigned to me across *all* clients/projects, rendered as
  task tiles (opening the same task drawer). Grouped or sorted by due date.
- **Today** — today's logged time summary + a quick "start timer" affordance
  (reuse existing time widgets; no new logic).
- **Upcoming** — my next sessions / calendar items (next few), as tiles linking
  into the relevant session/calendar view.
- **Manager block (managers only)** — the **unassigned task pool** with
  assign-to-member, carried over from the old `/dashboard/tasks` page so no
  capability is lost.

Greeting/welcome banners may stay, trimmed. This page reuses `<Tile>`/`<TileGrid>`
so it matches the rest of the app.

---

## F. Insights (merged analytics)

One page, three tabs (client-side tab state, default "Overview"; `?tab=activity`
/ `?tab=export` deep-links supported for the redirects):
- **Overview** — the current `/dashboard/insights` body (stat cards, 7-day chart,
  project health, manager team stats).
- **Activity** — the current `/dashboard/activity` body (idle detection + my/org
  activity feed).
- **Export** — the current `/dashboard/reports` body (gated export forms).

No analytics logic changes; the three existing page bodies become three tab
panels. Removed routes redirect here.

---

## G. Shell refactor (desktop + mobile from one source)

`DashboardShell.tsx` currently defines `NAV_GROUPS`, renders a desktop `<aside>`,
and renders a separate mobile horizontal-scroll `<nav>` (lines ~218–227).

- Extract the nav (logo, groups, bottom items, user card, sign-out) into a single
  `<SidebarNav>` component driven by the updated `NAV_GROUPS`.
- **Desktop:** `<aside>` renders `<SidebarNav>` (unchanged placement).
- **Mobile:** delete the horizontal scroll strip. Add a **hamburger button** to
  the sticky header. It toggles a `<MobileSidebar>` overlay that renders the same
  `<SidebarNav>`, sliding in from the left over a dimmed backdrop. The drawer:
  - opens/closes via local state,
  - closes on backdrop tap and on `pathname` change (`useEffect`),
  - traps nothing exotic — a simple focusable overlay with an explicit close (X).
- `NAV_GROUPS`, `PAGE_TITLES`, and `getTitle()` are updated for the new routes
  (add client sub-route titles; remove projects/tasks/reports/activity entries;
  `getTitle` recognises the nested client paths).

Result: one nav definition, two presentations — desktop and mobile cannot drift.

---

## H. Verification
No automated test runner in this repo. After each task:
- `pnpm run build` passes clean (tsc + eslint).
- Manual smoke of the new flow:
  - Sidebar shows the new groups; Projects/Tasks absent; hamburger opens the
    drawer on a narrow viewport and closes on navigation.
  - Clients grid → client home category tiles → Projects grid → project task grid
    → task drawer edits and persists.
  - Sessions category → session tiles → existing session detail still works.
  - Notes category → add/view notes.
  - Old links: `/dashboard/projects/<id>`, `/dashboard/tasks`,
    `/dashboard/reports`, `/dashboard/activity` all redirect correctly.
  - Insights page: three tabs render the prior three pages' content.
  - Home shows my tasks (+ pool for a manager account).

## I. Out of scope / future
- Task comments, subtasks, attachments, time-on-task (would promote the drawer to
  a full page).
- An explicit "Internal" client seed (create on demand, not part of this work).
- Per-tile drag-reordering of projects/sessions.
