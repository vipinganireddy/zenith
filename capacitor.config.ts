import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native iOS / Android wrapper. The apps load the same built web app (dist/)
 * from inside the bundle — every PDF tool still runs on the device.
 * Build and run: see docs/MOBILE.md.
 */
const config: CapacitorConfig = {
  appId: 'com.orithe.ozenith',
  appName: 'O-Zenith',
  webDir: 'dist',
  backgroundColor: '#f9f9fc',
  android: {
    // https://localhost keeps secure-context APIs (crypto.subtle, camera) available.
    // (Capacitor 8's default; stated so a future change doesn't silently break them.)
  },
  ios: {
    // The web layer handles the notch and home indicator with env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#f9f9fc',
  },
  plugins: {
    // No branded splash: the launch screen is a plain canvas-coloured view
    // (ios/App/App/Base.lproj/LaunchScreen.storyboard) and hides at once, so
    // the app opens straight onto Welcome (signed out) or Home.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#f9f9fc',
      showSpinner: false,
    },
    // 'body': the web view stays full-screen (so the app's own background shows
    // around the keyboard's rounded corners — 'native' shrank the view and left
    // black gaps there), and the app fits itself above the keyboard using the
    // height the plugin reports — see src/hooks/useKeyboard.ts.
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT',
    },
  },
};

export default config;
