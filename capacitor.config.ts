import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.alichevrolet',
  appName: 'Ali Chevrolet',
  webDir: 'dist',
  server: {
    url: 'https://7cd13b5a-6bc7-407c-b28f-91a5e8795805.lovableproject.com?forceHideBadge=true',
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