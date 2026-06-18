# TimeWiseHub Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package TimeWiseHub as a signed Android App Bundle (AAB) for Google Play Store using Tauri 2.0, wrapping `https://timewisehub.com.au` in a native Android WebView shell.

**Architecture:** Tauri 2.0 generates a standard Gradle/Android project (`src-tauri/gen/android/`). The WebView loads the production URL at launch — no local Next.js bundle, no code duplication. Native additions: notification permission, edge-to-edge safe areas, dark splash background, signed release build.

**Tech Stack:** Tauri 2.11.2, Rust, `tauri-plugin-notification = "2"`, Gradle Kotlin DSL, Android SDK 34, `keytool` (JDK-bundled)

---

## Pre-flight checklist (CONDUCTOR — verify before Task 1)

The build machine must have all of these before any task runs:

| Requirement | Check command |
|---|---|
| Android Studio (latest stable) installed | Open Android Studio — it should launch |
| Android SDK Platform 34 | Android Studio → SDK Manager → SDK Platforms |
| Android NDK (Side by side) | Android Studio → SDK Manager → SDK Tools |
| Java 17+ | `java -version` |
| `ANDROID_HOME` set | `echo $env:ANDROID_HOME` — should print the SDK path |
| `NDK_HOME` set | `echo $env:NDK_HOME` — should print the NDK path |
| Rust Android targets | `rustup target list --installed \| Select-String android` — should show 4 targets |

If Rust targets are missing, install them:
```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Typical Windows paths:
```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\<version>"  # replace <version> with installed NDK folder name
```

Verify Tauri can see the environment:
```powershell
pnpm tauri android init --help
```
Expected: prints usage text. If it errors about missing SDK/NDK, fix the env vars first.

---

## File map

**Modified before `tauri android init`:**
- `src-tauri/Cargo.toml` — add `tauri-plugin-notification = "2"`
- `src-tauri/src/lib.rs` — register notification plugin in builder chain

**Created by `tauri android init` (conductor runs this; generates the whole directory):**
- `src-tauri/gen/android/` — entire Gradle Android project (committed to repo)

**Created after init:**
- `src-tauri/tauri.android.conf.json` — Android-specific Tauri config overrides (new file)

**Modified after init (generated files):**
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — add `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` permissions
- `src-tauri/gen/android/app/src/main/res/values/colors.xml` — add `#020617` splash background color (create if absent)
- `src-tauri/gen/android/app/src/main/res/values/themes.xml` (or `styles.xml`) — set dark window background + edge-to-edge flags
- `src-tauri/gen/android/app/build.gradle.kts` — add release signing config via env vars

**Web layer:**
- `src/app/globals.css` — safe area insets for Android status bar + nav bar

---

## Division of labour

- **Codex**: all text file edits — Cargo.toml, lib.rs, JSON, XML, Kotlin, CSS
- **Conductor**: all shell commands — `pnpm tauri android init`, `pnpm tauri android dev`, `pnpm tauri android build`, `keytool`, `git`

---

### Task 1 — Add notification plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

The notification plugin enables the `POST_NOTIFICATIONS` runtime permission flow on Android 13+ (API 33+). Without registering it here in Rust, the manifest permission alone won't trigger the system dialog.

Note the two different plugin registration patterns in Tauri 2.0:
- `.plugin()` on the builder chain — used for plugins that don't need the app handle (notification)
- `app.handle().plugin()` inside `.setup()` — used for plugins that need the handle after init (log)

- [ ] **C1-1: Add plugin crate to Cargo.toml**

Edit `src-tauri/Cargo.toml`. Add one line to `[dependencies]`:

```toml
[package]
name = "timewisehub"
version = "0.1.2"
description = "TimeWiseHub Desktop"
authors = ["Vividex"]
license = ""
repository = ""
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "timewisehub_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.6.2", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.11.2", features = [] }
tauri-plugin-log = "2"
tauri-plugin-notification = "2"
```

- [ ] **C1-2: Register plugin in lib.rs**

Replace the full content of `src-tauri/src/lib.rs` with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

- [ ] **C1-3: [CONDUCTOR] Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "C1-1 add tauri-plugin-notification"
```

---

### Task 2 — Generate Android project

**Files:**
- Creates: `src-tauri/gen/android/` (entire directory, ~50 files — all committed)

`tauri android init` reads `tauri.conf.json` (identifier: `com.vividex.timewisehub`, productName: `TimeWiseHub`) and generates a complete Gradle project. This is a one-time operation — running it again would overwrite changes made in Tasks 4 and 8.

- [ ] **C2-1: [CONDUCTOR] Run tauri android init**

```powershell
pnpm tauri android init
```

The command may prompt:
- **App name** → `TimeWiseHub`
- **App identifier/domain** → `com.vividex.timewisehub` (or accept if it reads from tauri.conf.json automatically)

Accept any other defaults.

Expected: command completes without error and `src-tauri/gen/android/` now exists.

- [ ] **C2-2: [CONDUCTOR] Commit generated project**

```powershell
git add src-tauri/gen/
git commit -m "C2-1 tauri android init — generated Android project"
```

---

### Task 3 — Android Tauri config

**Files:**
- Create: `src-tauri/tauri.android.conf.json`

Tauri 2.0 automatically merges `tauri.android.conf.json` on top of `tauri.conf.json` when building for Android. The main config already has the correct window URL (`https://timewisehub.com.au`). This file only adds Android-specific overrides.

`minSdkVersion: 24` = Android 7.0 (2016), the minimum Tauri 2.0 supports, covering >99% of active Android devices.

- [ ] **C3-1: Create tauri.android.conf.json**

Create `src-tauri/tauri.android.conf.json` with this exact content:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "bundle": {
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

- [ ] **C3-2: [CONDUCTOR] Commit**

```powershell
git add src-tauri/tauri.android.conf.json
git commit -m "C3-1 Android config — minSdkVersion 24"
```

---

### Task 4 — Permissions and dark splash theme

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Create or modify: `src-tauri/gen/android/app/src/main/res/values/colors.xml`
- Modify: `src-tauri/gen/android/app/src/main/res/values/themes.xml` (or `styles.xml` — whichever Tauri generated)

Three changes here:
1. `POST_NOTIFICATIONS` permission — required on Android 13+ for the system dialog to appear
2. `RECEIVE_BOOT_COMPLETED` permission — allows the app to re-register notification listeners after reboot
3. Dark window background (`#020617`) + edge-to-edge flags — prevents a white flash before the WebView loads, and lets CSS `env(safe-area-inset-*)` variables work

- [ ] **C4-1: Add notification permissions to AndroidManifest.xml**

Open `src-tauri/gen/android/app/src/main/AndroidManifest.xml`. Add these two lines immediately after any existing `<uses-permission>` line (there will be at least `android.permission.INTERNET`). Do NOT replace the rest of the file — only add these two lines:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

The permissions block at the top of the manifest should look like:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

Leave everything else in the manifest exactly as Tauri generated it.

- [ ] **C4-2: Add dark background color**

Open `src-tauri/gen/android/app/src/main/res/values/colors.xml`. If it exists, ADD this line inside the `<resources>` element. If the file doesn't exist, CREATE it with this content:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_background">#020617</color>
</resources>
```

If the file already has other `<color>` entries, keep them — only add the `splash_background` line.

- [ ] **C4-3: Apply dark background and edge-to-edge to the app theme**

In `src-tauri/gen/android/app/src/main/res/values/`, open the file named `themes.xml` (it may instead be named `styles.xml` — open whichever one exists). It will contain a `<style>` element. Add three `<item>` entries inside it:

```xml
<item name="android:windowBackground">@color/splash_background</item>
<item name="android:windowTranslucentStatus">true</item>
<item name="android:windowTranslucentNavigation">true</item>
```

The style element should end up looking like this (the `parent` and `name` attributes will match whatever Tauri generated — do NOT change them):

```xml
<style name="Theme.TimeWiseHub" parent="...whatever Tauri generated...">
    <!-- keep any items already here -->
    <item name="android:windowBackground">@color/splash_background</item>
    <item name="android:windowTranslucentStatus">true</item>
    <item name="android:windowTranslucentNavigation">true</item>
</style>
```

`windowTranslucentStatus/Navigation` enable edge-to-edge mode so the WebView extends behind the status bar and nav bar, which is required for CSS `env(safe-area-inset-*)` to report non-zero values.

- [ ] **C4-4: [CONDUCTOR] Commit**

```powershell
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git add src-tauri/gen/android/app/src/main/res/values/
git commit -m "C4-1 Android permissions, dark splash, edge-to-edge theme"
```

---

### Task 5 — Safe area insets

**Files:**
- Modify: `src/app/globals.css`

The status bar (top) and navigation bar (bottom) overlap the WebView content when the app is in edge-to-edge mode. `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` are CSS env variables that Tauri's Android WebView populates with the exact heights of these system bars. They're zero on desktop/web so this has no effect outside the Android app.

The existing `body` rule in `globals.css` handles background/color/font — adding the padding there would require merging selectors. It's cleaner to put the safe-area rule in its own `@supports` block so it's clearly mobile-specific and easy to find.

- [ ] **C5-1: Append safe area CSS to globals.css**

Open `src/app/globals.css`. Append these lines at the very end of the file:

```css
/* Android edge-to-edge: push content clear of status bar and navigation bar.
   env() vars are 0 on desktop/web — no effect outside the Android Tauri app. */
@supports (padding-top: env(safe-area-inset-top)) {
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

- [ ] **C5-2: [CONDUCTOR] Verify web build still passes**

```powershell
pnpm run build
```

Expected: clean build, no TypeScript or ESLint errors. The CSS change is additive and doesn't touch any component code.

- [ ] **C5-3: [CONDUCTOR] Commit**

```powershell
git add src/app/globals.css
git commit -m "C5-1 safe area insets for Android edge-to-edge"
```

---

### Task 6 — Debug APK smoke test

**Files:** none — conductor only

Always validate with a debug build before dealing with signing. `pnpm tauri android dev` builds an unoptimised debug APK and sideloads it onto the connected device.

- [ ] **C6-1: [CONDUCTOR] Connect device and verify ADB sees it**

On the Android device: Settings → About phone → tap "Build Number" 7 times → go back → Developer options → enable USB debugging. Connect via USB cable. Then:

```powershell
adb devices
```

Expected output: your device serial listed with status `device` (e.g. `R5CT123ABCD   device`). If it shows `unauthorized`, unlock the phone and accept the USB debugging prompt.

- [ ] **C6-2: [CONDUCTOR] Build and install debug APK**

```powershell
pnpm tauri android dev
```

This builds a debug APK and installs it on the connected device. It may take 5–10 minutes on first run (Rust cross-compilation). The app will launch automatically on the device when done.

**Manual smoke checks on the device:**

- [ ] App opens and shows the TimeWiseHub splash screen (dark background, spinning logo)
- [ ] WebView loads `https://timewisehub.com.au` — login screen appears
- [ ] Login works (test with real credentials)
- [ ] Dashboard loads — status bar does NOT overlap the top navigation
- [ ] Bottom navigation bar does NOT overlap app content
- [ ] Team chat works — send and receive a message
- [ ] Android hardware/gesture back button: navigates within the app; pressing back on the dashboard (when there's no more history) minimises the app to the home screen rather than crashing
- [ ] No visible white flash on launch

If the splash background is white: check Task 4 — the `colors.xml` and `themes.xml` changes may not have been applied correctly.

If content is hidden behind the status bar: check Task 5 — the `@supports` block may not be working. Inspect in Chrome DevTools via `chrome://inspect` on desktop.

- [ ] **C6-3: [CONDUCTOR] Checkpoint commit**

```powershell
git commit --allow-empty -m "C6-1 debug smoke test passed on device"
```

---

### Task 7 — Generate release keystore

**Files:** none — conductor only. The keystore stays OUT of the repo permanently.

A release keystore is permanent. Google Play locks the signing key to your app listing — losing the keystore means losing the ability to push updates to that listing. Back it up in a password manager and an offline location.

- [ ] **C7-1: [CONDUCTOR] Generate the keystore**

Run this in a directory OUTSIDE the repo (e.g. `C:\Users\Abbot\Documents\keystores\`). Create that directory first if it doesn't exist.

```powershell
New-Item -ItemType Directory -Force "C:\Users\Abbot\Documents\keystores"
cd "C:\Users\Abbot\Documents\keystores"
keytool -genkey -v -keystore timewisehub-release.keystore -alias timewisehub -keyalg RSA -keysize 2048 -validity 10000
```

If `keytool` is not found, use the JDK bundled with Android Studio:
```powershell
& "$env:LOCALAPPDATA\Android\Android Studio\jbr\bin\keytool.exe" -genkey -v -keystore timewisehub-release.keystore -alias timewisehub -keyalg RSA -keysize 2048 -validity 10000
```

Answer the prompts:
- First and last name: `Vividex`
- Organisational unit: (press Enter to skip)
- Organisation: `Vividex`
- City or Locality: your city
- State or Province: your state
- Country code: `AU`
- Choose a **strong password** for both the keystore password and the key password (can be the same password)

Save the full keystore path, alias (`timewisehub`), and both passwords in your password manager right now.

- [ ] **C7-2: [CONDUCTOR] Set signing env vars for current session**

```powershell
$env:ANDROID_KEYSTORE_PATH = "C:\Users\Abbot\Documents\keystores\timewisehub-release.keystore"
$env:ANDROID_KEY_ALIAS = "timewisehub"
$env:ANDROID_KEY_PASSWORD = "your-key-password"
$env:ANDROID_STORE_PASSWORD = "your-store-password"
```

Replace the placeholder passwords with the real ones. These are session-scoped — you'll need to set them again in a new PowerShell window.

---

### Task 8 — Release signing config

**Files:**
- Modify: `src-tauri/gen/android/app/build.gradle.kts`

The signing config reads credentials from environment variables rather than hardcoding them — this keeps secrets out of the repo. The `storeFile` null check (`?.let { file(it) }`) prevents Gradle from failing when env vars aren't set (e.g. on CI or desktop builds).

- [ ] **C8-1: Add signing config to build.gradle.kts**

Open `src-tauri/gen/android/app/build.gradle.kts`. Find the `android { }` block. Inside it, locate or create `signingConfigs` and `buildTypes` sections and add the following (add only what's missing — do not duplicate existing blocks):

```kotlin
signingConfigs {
    create("release") {
        storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
        storePassword = System.getenv("ANDROID_STORE_PASSWORD")
        keyAlias = System.getenv("ANDROID_KEY_ALIAS")
        keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
    }
}
```

Then find the `release` build type inside `buildTypes { }` and add the signing config reference:

```kotlin
buildTypes {
    release {
        signingConfig = signingConfigs.getByName("release")
        // keep any existing isMinifyEnabled / proguardFiles lines Tauri generated
    }
}
```

If there is already a `buildTypes { release { ... } }` block, add only the `signingConfig` line inside it.

The final `android { }` block (abbreviated) should look like:

```kotlin
android {
    // ... namespace, compileSdk, defaultConfig etc. from Tauri ...

    signingConfigs {
        create("release") {
            storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
}
```

- [ ] **C8-2: [CONDUCTOR] Commit**

```powershell
git add src-tauri/gen/android/app/build.gradle.kts
git commit -m "C8-1 release signing config via env vars"
```

---

### Task 9 — Release AAB build and final commit

**Files:** none — conductor only

- [ ] **C9-1: [CONDUCTOR] Confirm env vars are set**

```powershell
echo $env:ANDROID_KEYSTORE_PATH
echo $env:ANDROID_KEY_ALIAS
```

Both should print non-empty values. If the PowerShell session was closed since Task 7, re-run the `$env:` assignments from C7-2.

- [ ] **C9-2: [CONDUCTOR] Build signed release AAB**

```powershell
pnpm tauri android build
```

This cross-compiles Rust for all Android targets, then assembles the AAB. Expect 10–20 minutes on first run; subsequent runs are faster (incremental). 

Expected: build completes with no errors. The final output line should reference the AAB path.

- [ ] **C9-3: [CONDUCTOR] Verify AAB exists**

```powershell
Test-Path "src-tauri\gen\android\app\build\outputs\bundle\release\app-release.aab"
```

Expected: `True`

```powershell
(Get-Item "src-tauri\gen\android\app\build\outputs\bundle\release\app-release.aab").Length / 1MB
```

Expected: a reasonable AAB size (typically 5–30 MB for a WebView wrapper app).

- [ ] **C9-4: [CONDUCTOR] Final commit and push**

```powershell
git commit --allow-empty -m "C9-1 release AAB build verified — ready for Play Console upload"
git push
```

---

## Play Store submission (post-build, manual — no code changes)

After the AAB is built and the app runs correctly:

1. Go to [play.google.com/console](https://play.google.com/console) → Create app → App name: `TimeWiseHub`, App or game: App, Free or paid: Free (Stripe handles payments), Developer Program Policies: accept

2. Go to **Release → Internal testing → Create new release** → upload `app-release.aab` → save

3. Fill in **Store listing**:
   - Short description (≤80 chars): `Track time, manage jobs, and stay connected with your team.`
   - Full description: Expand on time tracking, project management, chat, AI assistant, invoicing for trade businesses
   - App icon: `public/icon-512.png` (512×512 PNG, no transparency)
   - Feature graphic: 1024×500 PNG — create in Canva using Vividex branding (dark background, logo, tagline)
   - Phone screenshots: minimum 2, maximum 8 — taken from the device running the installed app

4. **Content rating** → Complete questionnaire → Category: Business → answer No to all sensitive content questions

5. **Privacy policy URL**: `https://timewisehub.com.au/privacy`

6. **App access**: All functionality is accessible without special account access (play testers can create their own accounts)

7. Publish to internal testing → install from Play Console internal test link → smoke test the installed version (it goes through Google's CDN, slightly different to sideloading) → promote to production when satisfied

---

## Acceptance criteria

- [ ] `pnpm tauri android dev` installs debug APK on device without errors
- [ ] App loads `https://timewisehub.com.au`, login works, chat works, AI assistant works
- [ ] Status bar does not overlap app content (safe area insets working)
- [ ] Dark splash — no white flash on launch
- [ ] Android back button navigates within the app; pressing back at the dashboard root minimises to the home screen
- [ ] `pnpm tauri android build` produces `app-release.aab` without signing errors
- [ ] AAB uploads to Play Console internal test track without validation errors
- [ ] App installed from Play Console internal track passes the same smoke checks as the debug APK
