# Desktop App Auto-Hiding Title Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tauri desktop app's native title bar with a custom one that's fully hidden
until the cursor hovers the top edge of the window, freeing up the space it currently takes.

**Architecture:** `decorations: false` in `tauri.conf.json` removes the native title bar entirely
(app-wide, Windows only); a new `TitleBar` component (gated to only render inside the actual
Tauri desktop build) replaces it with a custom draggable bar that slides in on hover and back out
after a short delay.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, `@tauri-apps/api`
2.11.0 (already a dependency — `core.isTauri()`, `window.getCurrentWindow()`), lucide-react.

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean — no test
  runner in this project.
- No new npm dependencies — `@tauri-apps/api` is already installed.
- Windows only this pass — no macOS/Linux-specific handling.
- App-wide — every page loses the native title bar and gains the custom one; not scoped to video
  call screens.
- Source spec: `docs/superpowers/specs/2026-07-06-desktop-titlebar-autohide-design.md`

---

### Task 1: Custom title bar

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src/components/desktop/TitleBar.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `TitleBar` (default export, no props) — mounted once in the root layout, no other
  component needs to reference it directly.

- [ ] **Step 1: Add `decorations: false` to the Tauri window config**

In `src-tauri/tauri.conf.json`, change:
```json
    "windows": [
      {
        "label": "main",
        "title": "TimeWiseHub",
        "url": "https://timewisehub.com.au",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "center": true
      }
    ],
```
to:
```json
    "windows": [
      {
        "label": "main",
        "title": "TimeWiseHub",
        "url": "https://timewisehub.com.au",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "center": true,
        "decorations": false
      }
    ],
```

- [ ] **Step 2: Create `src/components/desktop/TitleBar.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const [isDesktopApp, setIsDesktopApp] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsDesktopApp(isTauri())
  }, [])

  function cancelHide() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  function handleEnter() {
    cancelHide()
    setRevealed(true)
  }

  function handleLeave() {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setRevealed(false), 400)
  }

  if (!isDesktopApp) return null

  return (
    <>
      {/* Invisible trigger strip at the very top edge — hovering it reveals the bar below */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="fixed inset-x-0 top-0 z-[9999] h-1.5"
      />
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onDoubleClick={() => { getCurrentWindow().toggleMaximize() }}
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-[9999] flex h-9 items-center justify-between bg-slate-900 text-slate-200 transition-transform duration-150"
        style={{ transform: revealed ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div data-tauri-drag-region className="flex items-center gap-2 pl-3 text-xs font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-4 w-4" data-tauri-drag-region />
          TimeWiseHub
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => { getCurrentWindow().minimize() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-slate-700"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => { getCurrentWindow().toggleMaximize() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-slate-700"
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={() => { getCurrentWindow().close() }}
            className="flex h-9 w-10 items-center justify-center hover:bg-red-600"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  )
}
```

(both the trigger strip and the bar itself handle `onMouseEnter`/`onMouseLeave` identically —
moving directly from one to the other cancels the pending hide before it fires, so there's no
flicker crossing between them; `isTauri()` returning `false` on the regular website and the
Android build means this component renders nothing there, unaffected)

- [ ] **Step 3: Mount it in the root layout**

In `src/app/layout.tsx`, add the import:
```typescript
import TitleBar from "@/components/desktop/TitleBar";
```

Change:
```typescript
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="twh-theme">
          <ServiceWorkerRegistration />
```
to:
```typescript
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="twh-theme">
          <TitleBar />
          <ServiceWorkerRegistration />
```

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: passes clean (tsc + eslint).

- [ ] **Step 5: Manual smoke test (Windows desktop app only)**

Run `pnpm tauri:build` (or `pnpm tauri:dev` for a faster local check) and launch the app:
- Confirm no native title bar is visible and the custom bar is fully hidden by default (no
  visible sliver).
- Move the cursor to the very top edge of the window and confirm the bar slides in.
- Confirm minimize, maximize/restore, and close all work correctly.
- Confirm double-clicking the drag region (the icon/text area) toggles maximize.
- Confirm dragging the drag region moves the window.
- Move the cursor away from the top and confirm the bar hides again after a short delay (not
  instantly, not stuck open).
- Separately, confirm the regular website in a normal browser tab shows no title bar changes at
  all (unaffected, since `isTauri()` is false there).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json src/components/desktop/TitleBar.tsx src/app/layout.tsx
git commit -m "feat: desktop app — auto-hiding custom title bar"
```

---

## Acceptance checklist

- [ ] Native title bar removed (Windows desktop app), custom bar fully hidden by default.
- [ ] Hovering the top edge reveals the bar; it stays revealed while hovering it; hides after a
  short delay once the cursor leaves.
- [ ] Minimize/maximize/restore/close/drag/double-click-to-maximize all work.
- [ ] Regular website and Android build are unaffected.

## Verification

`pnpm run build` must pass clean — no test runner in this project. Manual smoke on the actual
Windows desktop build is required (this can't be verified via a normal browser session) — the
web/Android builds only need confirming they show no visible change.
