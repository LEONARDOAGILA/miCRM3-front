import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'micrm.app',
  appName: 'micrm',
  webDir: 'dist',
  // server: {
  //   url: 'https://crm.almespana.com.ec',
  //   cleartext: false
  // },
  android: {
    allowMixedContent: false
  },
  plugins: {
    Camera: {
      enableUpload: true
    }
  }
};


export default config;
