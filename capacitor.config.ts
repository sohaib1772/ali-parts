import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mkteb.ali.chevrolet',
  appName: 'مكتب علي شوفرليت',
  webDir: 'dist',
  server: {
    url: 'https://ali-parts-pro.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#0F172A',
  },
};


export default config;