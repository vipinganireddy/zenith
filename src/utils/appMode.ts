import { isNativeApp, isStandaloneLaunch } from './pwa';

/* "App mode": the iOS/Android app, the installed home-screen app, or any
   phone-sized screen. In app mode O-Zenith is only ever the app — the
   marketing website (home, features, pricing, about, blog, the website
   header and footer) is never shown; its routes lead into the app instead. */
export const isAppMode = () =>
  isNativeApp() || isStandaloneLaunch() || (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
