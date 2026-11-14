# Mobile app — installable web app + iOS / Android

O-Zenith ships to phones in two ways from **one codebase**:

| | Installable web app (PWA) | Native iOS / Android (Capacitor) |
|---|---|---|
| How people get it | Open the site → **Install app** (Android/desktop Chrome) or **Share → Add to Home Screen** (iPhone Safari) | App Store / Google Play |
| What runs | The deployed site, cached by `sw.js` | The same `dist/` bundled inside the app |
| Offline | App shell + every tool once it has been opened | Everything (bundled) |
| Google sign-in & Drive | ✅ | ❌ — Google blocks sign-in inside app web views (`disallowed_useragent`). The apps offer email and phone sign-in; see "Google sign-in in the native apps" below |
| Build needs | `npm run build` | Xcode (iOS), Android Studio (Android), developer accounts |

All PDF tools run on the device in both; no file is ever uploaded.

---

## The mobile UI (shared by both)

Phones (≤ 768 px) get an app shell instead of the website layout —
`src/components/layout/DashboardLayout.tsx`:

- **Bottom tab bar:** Home · Tools · AI · Files · Account. It respects the
  home-indicator safe area.
- **App bar:** shows the section title. Pushed screens (a tool, Favorites, Plans,
  an Account section) get a **‹ Back** button and hide the tab bar, as iOS does
  with `hidesBottomBarWhenPushed`.
- **History-backed pushed screens:** Account sections are `?section=…` URLs, so
  Android's back button and iOS swipe-back behave natively.
- **Scroll:** each screen opens at the top. Lists keep their search and filter
  chips pinned while scrolling (Tools).
- **Touch:** fields use 16 px text so iOS doesn't zoom on focus. Every button and
  link has a ≥ 40 px hit area via an invisible `::after` (`index.css`, "Finger-sized
  hit areas"). A press gives a scale response instead of hover effects.
- **Safe areas:** `viewport-fit=cover` + `env(safe-area-inset-*)` on the app
  bar, tab bar and page edges.

**Changing mobile layout:** components switch with `useIsMobile()` (inline styles
can't be reached by media queries). The audit used during development flags
horizontal overflow, tap targets under 40 px and text under 11 px at 375 px wide.

---

## Installable web app (PWA)

| Piece | File |
|---|---|
| Manifest (name, icons, colours, shortcuts, PDF file handler) | `public/manifest.webmanifest` |
| Icons (any + maskable + Apple touch + 1024 master) | `public/icons/` — source is `icon.svg` |
| Service worker source | `pwa/sw.js` |
| Build step that injects the app-shell list into `dist/sw.js` | `serviceWorker()` in `vite.config.ts` |
| Registration, install prompt, update flow | `src/utils/pwa.ts`, `src/components/pwa/InstallApp.tsx` |

- The service worker registers **only in production builds** and never inside the
  native apps.
- **Caching:** the app shell is precached. Tool chunks are cached the first time
  they're used, so installing doesn't download all 95 tools over mobile data.
  Navigations are network-first, so updates arrive. When a new version is ready,
  an **Update** bar appears; tapping it reloads into the new version.
- **Testing:** run `npm run build && npm run preview`, then open the site on a
  phone on the same network (`npm run preview -- --host`).
- **Hosting:** the site must be served over **HTTPS** for installation (Vercel
  already is). `sw.js` must not be cached long-term by the host;
  `vercel.json` sets `Cache-Control: no-cache` for it.

---

## Native apps (Capacitor)

Config: `capacitor.config.ts` (app id `com.orithe.ozenith`). Projects: `ios/`,
`android/`.

```bash
npm run build          # web bundle → dist/
npx cap sync           # copy dist/ + plugins into ios/ and android/
npx cap open ios       # Xcode → choose a simulator or device → Run
npx cap open android   # Android Studio → Run
```

One-time setup on a new Mac:

1. **Xcode** from the App Store. Then, in Terminal, run
   `sudo xcodebuild -license accept` and `xcodebuild -runFirstLaunch`.
2. **Android Studio** and an Android SDK (installed by its first-run wizard).
3. To release, you need an Apple Developer account ($99/yr) and a Google Play
   Console account ($25 once). Set the signing team in Xcode → *Signing &
   Capabilities*, and create an upload key in Android Studio → *Generate Signed
   Bundle*.

**Icons and splash:** generated from `public/icons/icon-1024.png`. To regenerate,
run `npx @capacitor/assets generate --iconBackgroundColor '#211200' --splashBackgroundColor '#211200'`.

### What has been verified

**iOS** (Xcode 27, iPhone 18 Pro simulator), checked with the Debug build:

- It builds with no warnings from the app itself; the remaining warnings come
  from plugin code.
- It installs with the O-Zenith icon and opens straight to sign-in, with nothing
  behind the status bar.
- Sign-up works end to end: the form, strength checklist and demo email code.
  The account is still signed in after the app relaunches.
- The tab bar sits clear of the home indicator. Tool screens are pushed with
  ‹ Back. Search suggestions sit above the page.
- Image to PDF works with the iOS photo picker (private access, no library
  permission needed). Two photos became a 2-page PDF, and **Download PDF opened
  the share sheet** (Save to Files, Print, Markup).

**Android:** the project is created and synced, but not compiled. Building it
needs Android Studio, which installs the SDK and a JDK. Open it with
`npx cap open android` and press Run.

### Gotchas when testing on the simulator

- Typing via automation drops keystrokes on the simulator. Type slowly, or use a
  real keyboard. The app is not at fault.
- After installing Xcode, accept its licence once:
  `sudo xcodebuild -license accept`.

### Google sign-in in the native apps

Google's OAuth page refuses to load in embedded web views, so the native builds
hide the Google buttons (`isNativeApp()` in `src/utils/pwa.ts`) and users sign in
with email or phone. Google Drive sync, which rides on that sign-in, is therefore
web-only for now.

Enabling it later needs:

- a native Google Sign-In plugin, for example `@capgo/capacitor-social-login`;
- iOS and Android OAuth client IDs in Google Cloud Console (Android requires the
  app's SHA-1 signing fingerprint);
- passing the resulting access token to the existing Drive code in
  `src/utils/googleDrive.ts`.

### Things that behave differently inside the apps

- **Camera (Scan to PDF):** the apps declare camera permission
  (`NSCameraUsageDescription` / `android.permission.CAMERA`). "Import photos" also
  works without it.
- **Downloads:** app web views ignore `<a download>`. `src/utils/nativeBridge.ts`
  intercepts every download link, including ones created in code. It writes the
  file to the app cache and opens the system share sheet: Save to Files, Drive,
  Mail, AirDrop on iOS, and the share targets on Android.
- **Google Drive:** "Save to Drive" and the Drive banner on Files are hidden in
  the apps, because Drive needs Google sign-in. People can still reach Drive
  through the share sheet with the Drive app.
- **Payments:** upgrades use Razorpay in the web page. Apple requires its own
  in-app purchase for digital subscriptions sold *inside* iOS apps (App Review
  3.1.1). Hide the upgrade flow in the iOS build, or add StoreKit, before submitting.
