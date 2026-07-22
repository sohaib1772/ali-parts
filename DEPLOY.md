# Deploying to production (maktabali.com)

Production: `169.58.35.214`, app at `/opt/maktabali-app`, systemd unit `maktabali.service`
(listening on `127.0.0.1:3000`), nginx + Let's Encrypt in front. Self-hosted Supabase at
`https://api.maktabali.com`.

## The one thing that will bite you

`VITE_*` variables are inlined by Vite **at build time**, not read at runtime. Building
without the production env bakes the local dev Supabase URL (`http://127.0.0.1:54321`) into
the client bundle. The server still returns **HTTP 200** with an HTML shell, so a status-code
check passes while every visitor sees a **blank page**.

This shipped to production on 2026-07-20 and went unnoticed through two deploys because the
only verification was `curl -o /dev/null -w "%{http_code}"`. **HTTP 200 is not proof of a
working deploy.** Verify rendered content.

`.env.production` (gitignored) supplies the correct values and takes precedence over
`.env.local` for `npm run build`. If it goes missing, the bug returns.

## Steps

```bash
# 1. Build with the production preset
NITRO_PRESET=node-server npm run build

# 2. GUARD — refuses to proceed if the bundle points at localhost. Never skip.
npm run predeploy

# 3. Ship (only if step 2 exited 0)
tar -czf /tmp/output.tgz .output
scp /tmp/output.tgz deploy@169.58.35.214:/tmp/output.tgz
ssh deploy@169.58.35.214 'set -e
  cd /opt/maktabali-app
  sudo rm -rf .output.bak && sudo mv .output .output.bak      # keep rollback
  sudo tar -xzf /tmp/output.tgz -C /opt/maktabali-app
  sudo chown -R deploy:deploy .output
  sudo systemctl restart maktabali.service'
```

## Verify by rendered content, not status code

```bash
# SSR HTML must carry real markup. A broken build returns ~10KB of empty shell;
# a healthy home page is ~25KB with Arabic text.
curl -s https://maktabali.com | wc -c
curl -s https://maktabali.com | grep -c "قطع غيار"

# Server-side data fetch must not be failing
ssh deploy@169.58.35.214 \
  'sudo journalctl -u maktabali.service --since "$(systemctl show maktabali.service -p ActiveEnterTimestamp --value)" \
   --no-pager | grep -cE "ECONNREFUSED|fetch failed"'     # must be 0
```

In a browser: `document.body.innerText.length > 0`, and no React error #419 in the console
(#419 means the SSR Suspense boundary failed — usually the data fetch above).

## Rollback

The previous build is kept at `/opt/maktabali-app/.output.bak` until the next deploy:

```bash
ssh deploy@169.58.35.214 'set -e
  cd /opt/maktabali-app
  sudo rm -rf .output && sudo mv .output.bak .output
  sudo systemctl restart maktabali.service'
```

## Native (Android / iOS) builds

### Toolchain: you must build with JDK 21

`java` on the dev machine is **JDK 25** (class file major version 69). Gradle 8.14.3 supports
up to Java 24 and fails at *script evaluation* with a message that names no file:

```
BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_'
Unsupported class file major version 69
```

Build with Android Studio's bundled JBR (JDK 21) instead:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"   # git bash
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"    # PowerShell
```

Android Studio does this automatically; only CLI builds need it set. Do **not** put
`org.gradle.java.home` in `android/gradle.properties` — that file is tracked, and a
machine-specific path there breaks every other machine. Use your **user-level**
`~/.gradle/gradle.properties` if you want it permanent.

### `CAP_MODE` — what the native shell loads

Set by `capacitor.config.ts`. **This replaced `CAP_ENV`,** which read backwards: it *removed*
`server.url`, so a store build was exactly when you had to NOT set `CAP_ENV=production`.
Following the obvious convention shipped a blank navy screen. `CAP_MODE=production` is now a
loud error rather than a silent stub.

| `CAP_MODE` | WebView loads | Use for |
|---|---|---|
| `wrapper` *(default)* | `https://maktabali.com` | Play/App Store wrapper builds |
| `bundled` | web assets in `capacitor-public/` | a self-contained app build |
| `livereload` | `$CAP_SERVER_URL` | local dev against your LAN dev server |

```bash
npx cap sync android                                    # wrapper (default)
CAP_MODE=bundled npx cap sync android                   # bundled
CAP_SERVER_URL=http://192.168.1.20:8080 \
  CAP_MODE=livereload npx cap sync android              # live reload
```

Every sync prints its resolved target, so the choice is never a guess:

```
[capacitor.config] CAP_MODE=wrapper → https://maktabali.com
```

**`bundled` is guarded.** `capacitor-public/index.html` is currently a boot-splash shell with
no `<script src>` — it paints, fades after 8s and leaves a blank navy screen, with an orphaned
`assets/` directory nothing loads. `CAP_MODE=bundled` therefore refuses to sync until a real
SPA build is copied into `capacitor-public/`.

The native bridge works fine in `wrapper` mode: Capacitor adds `server.url` to its allowed
bridge origins (`Bridge.java` → `setAllowedOriginRules`) and injects the plugin proxies into
the remote page at document-start, so plugins — including push — function against a remote
origin. This is the same mechanism Capacitor's own live-reload relies on.

### Release signing

The keystore lives **outside the repo** and is not recoverable if lost:

```
keystore : C:\Users\MOHAMMADAMIN\develop\app_lanch\maktabali-release.jks
alias    : maktabali-release
valid to : 2053-12-07
SHA-1    : 29:A1:FB:67:6D:4F:42:8D:8F:5F:E2:2B:6C:07:AC:58:60:A1:2E:28
SHA-256  : B1:E1:C7:58:05:06:4E:EC:04:8A:C7:B1:C1:19:4B:15:C7:E7:43:EC:99:AF:AD:61:BA:61:F8:E2:C8:D7:D4:2E
```

Credentials come from `android/key.properties` (gitignored; `*.jks`, `*.keystore` and
`android/key.properties` are all in `.gitignore`). No password appears in `build.gradle`.
**Back up both the `.jks` and `key.properties`.**

A release build with a missing `key.properties` fails at configuration rather than silently
producing an unsigned or debug-signed artifact — that failure would otherwise surface only at
Play upload time.

> **Play App Signing:** if you enrol, Google re-signs with *its own* key and the above becomes
> only your **upload** key. Production installs then carry a **different** SHA-1. Register the
> SHA-1 from *Play Console → Setup → App signing* on the Google Sign-In OAuth client as well,
> or sign-in works locally and fails for every real user.

`minifyEnabled` + `shrinkResources` are on for release. Verified with a full `assembleRelease`:
R8 completes with no missing-class warnings and no `missing_rules.txt`, all 7 Capacitor plugins
survive (Capacitor ships consumer ProGuard keep rules), and the resource shrinker drops only
AppCompat/Material chrome — the launcher icon, splash and web assets are intact.

## Notes

- `/opt/maktabali-app/app.env` holds **runtime** server vars (service-role key, `ADMIN_OTP_ENABLED`).
  Its `SUPABASE_URL=http://127.0.0.1:8000` is Kong-internal and correct for server-side use —
  the *client* needs the public `https://api.maktabali.com`. Don't copy one into the other.
- Apple client secret expires **2027-01-18**; runbook at `/root/apple/README-apple.txt`.
