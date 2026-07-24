# iOS & Android Build Guide — App Store / Play Store

This project is wrapped with **Capacitor** (`capacitor.config.ts`) and ready to be
published to the App Store and Google Play. The web app is a mobile-first RTL
Arabic PWA (safe-area aware, standalone display, dark navy theme).

---

## 1. Prerequisites

The repo already lives on GitHub — clone it and install:

```bash
git clone git@github.com:<you>/<repo>.git
cd <repo>
npm install      # bun install also works; bunfig.toml configures the install guard
```

`.env.production` (gitignored) must be present before any build — see
**DEPLOY.md → "The one thing that will bite you"**. `VITE_*` vars are inlined at
build time, so building without it bakes the local dev Supabase URL into the
bundle and ships an app that talks to `127.0.0.1`.

---

## 2. Build the web bundle for native

Capacitor loads the compiled web assets from `webDir` (`capacitor-public`). Build
the production bundle first:

```bash
# Build the TanStack Start production bundle (same preset DEPLOY.md uses)
NITRO_PRESET=node-server npm run build

# Copy the built client output into the Capacitor webDir.
# The Nitro build emits client assets to .output/public — there is no dist/.
rm -rf capacitor-public && mkdir capacitor-public
cp -R .output/public/* capacitor-public/
```

Verify `capacitor-public/index.html` exists **and contains a `<script src=…>`**
before continuing — `CAP_MODE=bundled` refuses to sync otherwise, because an
index.html with no script bundle is the boot-splash stub and ships a blank screen.

---

## 3. Sync Capacitor (pick a mode)

`CAP_MODE` selects what the native shell loads. Full table in **DEPLOY.md →
Native (Android / iOS) builds**.

> **`CAP_ENV` is gone.** It read backwards — it *removed* `server.url`, so a store
> build was exactly when you had to NOT set `CAP_ENV=production`, and following the
> obvious convention shipped a blank screen. `CAP_MODE=production` is now a loud
> error instead of a silent stub.

```bash
# Self-contained build (bundled assets) — required for App Store submission.
# Refuses to sync while capacitor-public/ is still the boot-splash stub.
CAP_MODE=bundled npx cap sync ios
CAP_MODE=bundled npx cap sync android

# Wrapper build — loads https://maktabali.com. This is the DEFAULT.
npx cap sync ios

# Local live-reload against your machine.
CAP_SERVER_URL=http://192.168.1.20:8080 CAP_MODE=livereload npx cap sync ios
```

Each sync prints its resolved target — check this line before you archive:

```
[capacitor.config] CAP_MODE=bundled → bundled assets in capacitor-public/
```

Android CLI builds also need **JDK 21** (`JAVA_HOME` → Android Studio's JBR); the
JDK 25 on `PATH` cannot run Gradle 8.14.3. See DEPLOY.md.

---

## 4. iOS — Xcode & App Store

Requires macOS + Xcode 15+ and an Apple Developer account.

```bash
npx cap open ios
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → set your Team and a
   unique Bundle Identifier (default: `com.mkteb.ali.chevrolet`).
2. **General** → set Version (e.g. `1.0.0`) and Build (e.g. `1`).
3. Replace launch/app icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
   and `Splash.imageset/` (drag your 1024×1024 icon and 2732×2732 splash).
4. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. Create the listing at https://appstoreconnect.apple.com, attach the build,
   fill metadata (Arabic + English), submit for review.

App Store requirements already covered by this project:
- HTTPS-only network calls (Supabase + assets)
- Portrait + landscape support (declared in `Info.plist`)
- RTL Arabic UI, safe-area insets for notch/home indicator
- Standalone PWA display, black-translucent status bar
- Real content on every route, no placeholder pages

### Required Info.plist additions (if you use these features)
Add via Xcode → App → Info tab if the corresponding permission is needed:
- `NSCameraUsageDescription` — only if adding camera pickers
- `NSPhotoLibraryUsageDescription` — for image uploads from library
- `NSUserTrackingUsageDescription` — only if adding tracking SDKs

---

## 5. Android — Android Studio & Play Store

Requires Android Studio + a Play Console account.

```bash
npx cap open android
```

1. In `android/app/build.gradle` set `versionCode` and `versionName`.
2. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
3. Signing is already wired — `signingConfigs.release` reads `android/key.properties`,
   so Android Studio picks it up without prompting. The keystore lives outside the
   repo; see **DEPLOY.md → Release signing** for its path, fingerprints and the
   Play App Signing caveat about which SHA-1 to register for Google Sign-In.
4. Upload the `.aab` to https://play.google.com/console.

---

## 6. Updating the app after code changes

```bash
NITRO_PRESET=node-server npm run build
rm -rf capacitor-public && mkdir capacitor-public && cp -R .output/public/* capacitor-public/
CAP_MODE=bundled npx cap sync
# Then re-archive in Xcode / regenerate the .aab in Android Studio
```

> Only needed for **bundled** builds. The current Play Store build is a `wrapper`
> (loads `https://maktabali.com`), so shipping a web change there is a normal
> deploy per DEPLOY.md — no rebuild, no store submission.

Bump the version/build number in Xcode and `android/app/build.gradle` before
each store submission.

---

## 7. Troubleshooting

- **White screen in native app** → `capacitor-public/` holds no real build. `CAP_MODE=bundled`
  now refuses to sync in that state, so this should surface as a build error, not a
  blank app. Re-run step 2.
- **App loads the website instead of the bundle** → you were in the default `wrapper`
  mode. Use `CAP_MODE=bundled npx cap sync` and rebuild.
- **`Unsupported class file major version 69`** on an Android build → wrong JDK. Point
  `JAVA_HOME` at Android Studio's JBR (JDK 21); see DEPLOY.md.
- **Content under the notch / status bar** → make sure pages use `PageShell`
  or apply `pt-[env(safe-area-inset-top)]` to top-level headers.
- **App rejected for "web wrapper"** → ensure meaningful native metadata
  (icon, splash, name) and that the app works fully offline for cached pages.