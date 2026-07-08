# iOS & Android Build Guide — App Store / Play Store

This project is wrapped with **Capacitor** (`capacitor.config.ts`) and ready to be
published to the App Store and Google Play. The web app is a mobile-first RTL
Arabic PWA (safe-area aware, standalone display, dark navy theme).

---

## 1. Export the project to GitHub

1. In Lovable: top-right → **GitHub → Connect** → authorize the Lovable GitHub App.
2. Choose the org/account and click **Create Repository**.
3. Clone locally:
   ```bash
   git clone git@github.com:<you>/<repo>.git
   cd <repo>
   ```
4. Install deps:
   ```bash
   bun install    # or: npm install
   ```

---

## 2. Build the web bundle for native

Capacitor loads the compiled web assets from `webDir` (`capacitor-public`). Build
the production bundle first:

```bash
# Build the TanStack Start production bundle
bun run build

# Copy the built client output into the Capacitor webDir
# (adjust the source dir if your build outputs elsewhere)
rm -rf capacitor-public && mkdir capacitor-public
cp -R dist/client/* capacitor-public/ 2>/dev/null || cp -R .output/public/* capacitor-public/
```

Verify `capacitor-public/index.html` exists before continuing.

---

## 3. Sync Capacitor (production mode)

`CAP_ENV=production` strips the remote `server.url` from `capacitor.config.ts` so
the native app loads local bundled assets — required for App Store submission.

```bash
CAP_ENV=production npx cap sync ios
CAP_ENV=production npx cap sync android
```

For local development with live-reload against the deployed preview, omit
`CAP_ENV`:
```bash
npx cap sync ios
```

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
3. Create a keystore the first time; keep it safe — it's required for every update.
4. Upload the `.aab` to https://play.google.com/console.

---

## 6. Updating the app after code changes

```bash
bun run build
rm -rf capacitor-public && cp -R dist/client/* capacitor-public/
CAP_ENV=production npx cap sync
# Then re-archive in Xcode / regenerate the .aab in Android Studio
```

Bump the version/build number in Xcode and `android/app/build.gradle` before
each store submission.

---

## 7. Troubleshooting

- **White screen in native app** → `capacitor-public/` is empty. Re-run step 2.
- **App loads the website instead of the bundle** → you forgot `CAP_ENV=production`
  before `cap sync`. Re-sync and rebuild.
- **Content under the notch / status bar** → make sure pages use `PageShell`
  or apply `pt-[env(safe-area-inset-top)]` to top-level headers.
- **App rejected for "web wrapper"** → ensure meaningful native metadata
  (icon, splash, name) and that the app works fully offline for cached pages.