import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// Set CAP_ENV=production before running `npx cap sync` for App Store / Play Store builds.
// In production the app loads the bundled web assets from `webDir` (no live-reload URL).
const isProduction = process.env.CAP_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.mkteb.ali.chevrolet',
  appName: 'مكتب علي شوفرليت',
  webDir: 'capacitor-public',
  ...(isProduction
    ? {}
    : {
        server: {
          url: 'https://ali-parts-pro.lovable.app?forceHideBadge=true',
          cleartext: true,
        },
      }),
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