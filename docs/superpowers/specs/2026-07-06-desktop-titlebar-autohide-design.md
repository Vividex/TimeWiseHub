# Desktop App: Auto-Hiding Title Bar

## Origin

Raised while testing the in-call worksheet feature: the Tauri desktop app's native OS title bar
("black frame" saying TimeWiseHub in the top-left, standard chrome since `tauri.conf.json` sets
no custom decorations) crowds/covers the video call's own top controls (Daily's PiP button, grid
view, etc.). Explored as its own follow-up rather than an ad hoc fix, since it's real scope beyond
one screen — removing native decorations affects the whole app, not just video calls.

## Confirmed requirements

- **App-wide, not video-call-specific.** `decorations: false` removes the native title bar for
  the entire app; the custom replacement applies everywhere, one consistent behavior.
- **Windows only, for now.** The user develops and tests on Windows; macOS has its own window
  conventions (traffic-light buttons, different placement) that would need real testing on a Mac
  to get right, not guessed at now. Deferred until there's a Mac to verify against.
- **Standard controls only**: minimize, maximize/restore, close, a draggable region, and
  double-click-to-maximize — matching what the native title bar already provides today, just with
  auto-hide behavior added. No extra custom buttons this pass.
- **Completely invisible when hidden** — no persistent visible sliver/hint. Confirmed trade-off:
  less discoverable than a visible hint strip, but maximizes screen space, which was the whole
  point of this request.
- **Short hide delay (~400ms)** after the cursor leaves the trigger zone/bar, so briefly passing
  the mouse near the top edge doesn't cause visible flicker.

## Architecture

One well-established pattern for this — a frameless window plus a custom in-page title bar built
with Tauri's own window JS API. No genuinely different alternative was found worth comparing:
Tauri's `titleBarStyle: "overlay"` option is macOS-only (out of scope per the Windows-only
decision above), and every other native-title-bar-removal path converges on the same "build your
own bar" approach.

### Config change

`src-tauri/tauri.conf.json`'s `app.windows[0]` entry gains `"decorations": false`.

### New component: `src/components/desktop/TitleBar.tsx`

- Mounted once in the root layout (`src/app/layout.tsx`), so it's present on every page.
- Renders **nothing** unless running inside the actual Tauri desktop app — checked via
  `@tauri-apps/api/core`'s `isTauri()` — so the regular website and the Android build are
  completely unaffected; this is purely additive for the Windows desktop build.
- Contents: app icon + "TimeWiseHub" text inside a `data-tauri-drag-region` draggable area, plus
  three buttons (minimize, maximize/restore, close) wired to `getCurrentWindow()` from
  `@tauri-apps/api/window` (`.minimize()`, `.toggleMaximize()`, `.close()`).
- Double-click anywhere on the drag region also calls `.toggleMaximize()`, matching native
  title-bar behavior.

### Reveal mechanics

- The bar itself: `position: fixed`, top of viewport, normally `transform: translateY(-100%)`
  (fully off-screen, no visible trace).
- A separate, always-present invisible trigger strip (~6px tall) sits at the very top edge of the
  window. Hovering it sets a `revealed` state to `true`, sliding the bar into view
  (CSS transition on `transform`).
- Once revealed, the bar's own `onMouseEnter`/`onMouseLeave` participate in the same `revealed`
  state, so moving the cursor from the trigger strip onto the bar itself doesn't count as leaving.
- Leaving both the trigger strip and the bar starts a ~400ms `setTimeout` before setting
  `revealed` back to `false`; re-entering either area within that window cancels the pending hide.
- Since the window has no native title bar reserving vertical space anymore, no other page needs
  layout changes — the trigger strip and the bar both overlay on top of existing content rather
  than pushing it down.

## Non-goals (explicit)

- No macOS-specific styling or behavior this pass (traffic-light button conventions, `overlay`
  title bar style) — deferred until there's a Mac to test against.
- No Linux-specific handling — `tauri.conf.json` bundles for "all" targets today, but this spec
  only addresses Windows; Linux inherits whatever the generic frameless-window behavior does,
  unverified.
- No extra buttons/menu beyond the three standard window controls.
- No visible "hint" affordance for the hidden state — confirmed trade-off, not an oversight.
- No change to the Android build or the regular website — both are untouched, gated out via
  `isTauri()`.

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test runner).
- Manual smoke, Windows desktop app only: launch the app, confirm no native title bar is visible
  and the custom bar is fully hidden by default; move the cursor to the very top edge and confirm
  the bar slides in; confirm minimize/maximize/restore/close all work; confirm double-clicking the
  drag region toggles maximize; confirm moving the cursor away (past the ~400ms delay) hides the
  bar again; confirm dragging the drag region moves the window. Confirm the regular website
  (browser) and the Android build show no title bar at all (unaffected).
