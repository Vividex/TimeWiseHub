# Phase 24 — Android App (Tauri 2.0)

## Goal
Package TimeWiseHub for the Google Play Store using Tauri 2.0's Android support.
The app wraps `https://timewisehub.com.au` in a native Android WebView shell,
adding: notification permissions, dark splash, edge-to-edge safe areas, and
a signed release AAB ready for Play Console upload.

## Source plan
`docs/superpowers/plans/2026-06-18-android-app.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-18-android-app-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.toml, .rs, .json, .xml, .kts, .css).
- **Conductor**: ALL shell commands — `pnpm tauri android init`, `pnpm tauri android dev`,
  `pnpm tauri android build`, `keytool`, `adb`, `pnpm run build`, commits.
  Steps marked `[CONDUCTOR]` must NOT be executed by Codex.
- Windows note: Codex workspace-write sandbox cannot spawn subprocesses on Windows.
  Codex does text edits only; conductor runs all shell/build/git commands.

## Pre-flight (CONDUCTOR must verify BEFORE Task 1)
- [x] PRE-1: `echo $env:ANDROID_HOME` prints the SDK path (e.g. `C:\Users\Abbot\AppData\Local\Android\Sdk`)
- [x] PRE-2: `echo $env:NDK_HOME` prints the NDK path
- [x] PRE-3: `java -version` prints Java 17+ (Java 21 via Android Studio JBR)
- [x] PRE-4: `rustup target list --installed | Select-String android` shows 4 android targets
- [x] PRE-5: `pnpm tauri android init --help` prints usage (no SDK/NDK errors)

## Acceptance checklist

### Task 1 — Notification plugin
- [x] C1-1: Add `tauri-plugin-notification = "2"` to `[dependencies]` in `src-tauri/Cargo.toml`
- [x] C1-2: Register `.plugin(tauri_plugin_notification::init())` in `src-tauri/src/lib.rs` (before `.setup()`)
- [x] C1-3: [CONDUCTOR] Commit

### Task 2 — Android project init
- [x] C2-1: [CONDUCTOR] Run `pnpm tauri android init` (answer App name: TimeWiseHub if prompted)
- [x] C2-2: [CONDUCTOR] `git add src-tauri/gen/` and commit generated Android project

### Task 3 — Android Tauri config
- [x] C3-1: Create `src-tauri/tauri.android.conf.json` with `bundle.android.minSdkVersion: 24`
- [x] C3-2: [CONDUCTOR] Commit

### Task 4 — Permissions and dark splash theme
- [x] C4-1: Add `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` permissions to `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- [x] C4-2: Add `splash_background` color `#020617` to `src-tauri/gen/android/app/src/main/res/values/colors.xml` (create file if absent)
- [x] C4-3: Add `windowBackground`, `windowTranslucentStatus`, `windowTranslucentNavigation` items to the app theme in `src-tauri/gen/android/app/src/main/res/values/themes.xml` (or `styles.xml` — whichever Tauri generated)
- [x] C4-4: [CONDUCTOR] Commit

### Task 5 — Safe area insets
- [x] C5-1: Append `@supports (padding-top: env(safe-area-inset-top))` block to `src/app/globals.css`
- [x] C5-2: [CONDUCTOR] `pnpm run build` — must pass clean
- [x] C5-3: [CONDUCTOR] Commit

### Task 6 — Debug APK smoke test (requires USB device — user present)
- [ ] C6-1: [CONDUCTOR] Connect Android device, run `adb devices` — device must show `device` status
- [ ] C6-2: [CONDUCTOR] Run `pnpm tauri android dev`, manually verify on device (see plan for checklist)
- [ ] C6-3: [CONDUCTOR] Checkpoint commit

### Task 7 — Release keystore (requires interactive keytool — user present)
- [ ] C7-1: [CONDUCTOR] Generate `timewisehub-release.keystore` with `keytool` (outside repo), save to password manager
- [ ] C7-2: [CONDUCTOR] Set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD` env vars

### Task 8 — Release signing config
- [ ] C8-1: Add `signingConfigs { create("release") { ... } }` and `signingConfig = signingConfigs.getByName("release")` to `src-tauri/gen/android/app/build.gradle.kts`
- [ ] C8-2: [CONDUCTOR] Commit

### Task 9 — Release AAB build
- [ ] C9-1: [CONDUCTOR] Confirm signing env vars are set
- [ ] C9-2: [CONDUCTOR] Run `pnpm tauri android build`
- [ ] C9-3: [CONDUCTOR] Verify `src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab` exists
- [ ] C9-4: [CONDUCTOR] Commit and push

## Verification
- `pnpm run build` passes clean after Task 5 (web build unaffected by CSS addition)
- `pnpm tauri android dev` installs debug APK on physical device; login + chat work; safe area insets correct; splash dark
- `pnpm tauri android build` produces `app-release.aab` without signing errors
- AAB uploads to Play Console internal test track without validation errors
