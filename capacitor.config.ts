import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_DIR = 'capacitor-public';
const PRODUCTION_URL = 'https://maktabali.com';

/**
 * CAP_MODE decides what the native shell loads. See DEPLOY.md → "Native
 * (Android / iOS) builds".
 *
 *   wrapper    (default) WebView loads PRODUCTION_URL over https. The native
 *                        bridge and every plugin still work: Capacitor adds
 *                        `server.url` to its allowed bridge origins and injects
 *                        the plugin proxies into the remote page at
 *                        document-start.
 *   bundled              WebView loads the built web assets from webDir. Only
 *                        valid once a real SPA build has been copied there.
 *   livereload           WebView loads CAP_SERVER_URL — your LAN dev server.
 *
 * This replaces the old `CAP_ENV=production` flag, which read backwards. That
 * flag *removed* server.url, so a Play Store wrapper build was precisely when
 * you had to NOT set it. Anyone following the obvious convention
 * (`CAP_ENV=production` for a store build) silently shipped the boot-splash
 * stub — a blank navy screen. Modes are now named after what they produce.
 */
const MODES = ['wrapper', 'bundled', 'livereload'] as const;
type CapMode = (typeof MODES)[number];

const requested = process.env.CAP_MODE ?? 'wrapper';
if (!(MODES as readonly string[]).includes(requested)) {
  throw new Error(
    `CAP_MODE="${requested}" is not a valid mode.\n` +
      `Use one of: ${MODES.join(' | ')}. See DEPLOY.md → "Native (Android / iOS) builds".`,
  );
}
const mode = requested as CapMode;

/**
 * `bundled` ships whatever currently sits in webDir. Today that is a
 * boot-splash shell with no `<script src>` at all: it paints, fades out after
 * 8s and leaves a blank navy screen, with an orphaned `assets/` directory that
 * nothing ever loads. Shipping that is the same class of failure DEPLOY.md was
 * written about, so refuse to sync rather than produce it.
 */
function assertBundledAssetsAreReal(): void {
  const indexPath = resolve(process.cwd(), WEB_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`CAP_MODE=bundled but ${WEB_DIR}/index.html does not exist.`);
  }
  if (!/<script[^>]+\bsrc=/i.test(readFileSync(indexPath, 'utf8'))) {
    throw new Error(
      `CAP_MODE=bundled but ${WEB_DIR}/index.html loads no script bundle — it is still the boot-splash stub.\n` +
        `Building from it produces an app that shows a blank navy screen.\n` +
        `Copy a real SPA build into ${WEB_DIR}/ first, or use CAP_MODE=wrapper to load ${PRODUCTION_URL}.`,
    );
  }
}

function liveReloadUrl(): string {
  const url = process.env.CAP_SERVER_URL;
  if (!url) {
    throw new Error(
      'CAP_MODE=livereload requires CAP_SERVER_URL, e.g.\n' +
        '  CAP_SERVER_URL=http://192.168.1.20:8080 CAP_MODE=livereload npx cap sync android',
    );
  }
  return url;
}

// `cleartext` is deliberately scoped to livereload only. It permits plaintext
// HTTP for the whole app, which a https:// wrapper target never needs.
let server: CapacitorConfig['server'];
switch (mode) {
  case 'wrapper':
    server = { url: PRODUCTION_URL };
    break;
  case 'livereload':
    server = { url: liveReloadUrl(), cleartext: true };
    break;
  case 'bundled':
    assertBundledAssetsAreReal();
    server = undefined;
    break;
}

// Surfaced in `cap sync` output so the chosen target is never a guess.
console.log(
  `[capacitor.config] CAP_MODE=${mode} → ${server?.url ?? `bundled assets in ${WEB_DIR}/`}`,
);

const config: CapacitorConfig = {
  appId: 'com.mkteb.ali.chevrolet',
  appName: 'مكتب علي شوفرليت',
  webDir: WEB_DIR,
  ...(server ? { server } : {}),
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A192F',
  },
  android: {
    backgroundColor: '#0A192F',
  },
  plugins: {
    // The app shell is `fixed inset-0`, so it is anchored to the visual viewport
    // and cannot shrink on its own when the soft keyboard opens. `resize: 'body'`
    // only changes the document body height, which a viewport-anchored fixed
    // element ignores — the keyboard would still cover inputs / the Confirm button.
    // `resize: 'native'` shrinks the entire WebView, so `inset-0` / 100vh recompute
    // above the keyboard and the shell content stays reachable.
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
