import type { CapacitorConfig } from '@capacitor/cli';

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
    backgroundColor: '#0F172A',
  },
};


export default config;