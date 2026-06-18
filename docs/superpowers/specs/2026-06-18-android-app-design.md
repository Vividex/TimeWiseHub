# TimeWiseHub Android App — Design Spec

## Goal

Package TimeWiseHub for the Google Play Store using Tauri 2.0's Android support. The app wraps the existing web app at `https://timewisehub.com.au` in a native Android shell — no new codebase, no duplicate logic. Auth, data, and all features work exactly as they do on the web.

## Architecture

Tauri 2.0 runs as the Android host. Its WebView loads `https://timewisehub.com.au` on launch. Everything the user sees is the existing Next.js web app. The native shell adds: proper Play Store distribution, push notifications, back button handling, and safe area insets.

**Always-connected**: no offline support in v1. Offline task/data caching is a future improvement (see memory note).

**Not in scope**: iOS, floating chat heads (Android Bubbles), FCM/Firebase integration.

## What gets built

### 1 — Tauri Android project initialisation

`tauri android init` generates `src-tauri/gen/android/` — a standard Gradle/Android project wrapping the Tauri runtime. This is a one-time CONDUCTOR step that creates the Android project skeleton. The generated files are committed to the repo.

**Prerequisites (must be installed on the build machine before this step):**
- Android Studio (latest stable)
- Android SDK Platform 34 (API 34)
- Android NDK (version bundled with Android Studio)
- Java 17+ (JDK, bundled with Android Studio)
- `ANDROID_HOME` and `NDK_HOME` environment variables set

Key generated files:
- `src-tauri/gen/android/app/build.gradle.kts` — build config, target SDK, signing
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — permissions, intent filters
- `src-tauri/gen/android/buildSrc/` — Rust build helpers

### 2 — Android config

`src-tauri/tauri.android.conf.json` overrides for mobile:
- App label: "TimeWiseHub"
- Window background colour: `#020617` (matches splash screen)
- URL: `https://timewisehub.com.au` (same as desktop)
- No title bar

### 3 — Rust: notification plugin

Add `tauri-plugin-notification` to `Cargo.toml` and register it in `lib.rs`. This enables native Android notification delivery — important for Android 13+ where `POST_NOTIFICATIONS` runtime permission is required. The existing web-push service worker continues to work alongside this for browsers; the native plugin improves reliability for the installed app.

`AndroidManifest.xml` gets the permission:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

### 4 — Safe area insets

Android status bar and navigation bar overlap the WebView unless handled. Add CSS to `globals.css` using `env(safe-area-inset-*)` to pad the top and bottom of the layout so content sits clear of system chrome. The Tauri Android WebView exposes these env vars automatically.

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

This must not affect the web/desktop versions — wrap in a `@supports` or apply only when the vars are non-zero (they're 0 on desktop).

### 5 — Android back button

Android's hardware/gesture back button fires a `popstate` or `backbutton` event in Tauri. Default behaviour navigates the WebView history, which is correct for most in-app navigation. The one edge case: if the user is at the root of a section (e.g. `/dashboard`), pressing back should minimise the app rather than show a blank history state. Handle this in the web layer by detecting when there's no history to pop and calling `window.history.go(0)` or the Tauri app exit API.

### 6 — App signing

A release keystore is generated once and stored securely outside the repo. `build.gradle.kts` is configured to use it for release builds via environment variables (not hardcoded). The keystore file and passwords are documented in a secure location (e.g. password manager) — losing the keystore means losing the ability to update the Play Store listing.

Signing config uses env vars:
- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`

### 7 — Play Store assets

Done after the build, once the app is running on a physical device (screenshots require a real working build).

Required before submission:
- **App icon**: 512×512 PNG (use existing `public/icon-512.png`)
- **Feature graphic**: 1024×500 PNG — created manually after build
- **Screenshots**: minimum 2, maximum 8, phone screenshots — taken from the running app on device
- **Short description**: ≤80 chars
- **Full description**: ≤4000 chars
- **Privacy policy URL**: `https://timewisehub.com.au/privacy` (already exists)
- **Content rating**: complete the Play Console questionnaire (business tools category, no user-generated content issues)

## Build output

`pnpm tauri android build` produces a signed AAB (Android App Bundle) at `src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab`. This file is uploaded directly to Google Play Console.

## Division of labour (handover loop)

- **Codex**: all text file edits — Cargo.toml, lib.rs, tauri.android.conf.json, globals.css, AndroidManifest.xml, build.gradle.kts
- **Conductor**: `tauri android init`, `pnpm tauri android build`, keystore generation, signing env setup, Play Store upload

## Acceptance criteria

- `tauri android init` completes without error
- `pnpm tauri android build` produces a signed AAB
- Installed APK/AAB on a physical Android device: app opens, loads timewisehub.com.au, login works, chat works, push notifications arrive
- Status bar does not overlap app content
- Android back button navigates correctly; pressing back at the dashboard root minimises the app
- AAB uploaded to Play Console internal test track without validation errors
