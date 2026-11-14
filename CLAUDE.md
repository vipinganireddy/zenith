# O-Zenith — context for Claude

Privacy-first, browser-based PDF workspace. **95 tools**, no backend.
Vite + React 19 + React Router + TypeScript. ~24k lines, ~110 source files.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before structural work and
[docs/DECISIONS.md](docs/DECISIONS.md) before changing anything that looks odd —
most oddities are deliberate and documented.

---

## Commands

```bash
npm install                                 # first run on a new machine
npm run dev                                 # http://localhost:5173
npm run build                               # tsc -b + vite build — the real check
npm run lint
node --test src/utils/*.test.ts src/data/*.test.ts   # unit tests, no framework
```

Always finish a change with `npm run build`. It typechecks *and* bundles;
`tsc --noEmit` alone misses resolution errors.

---

## Hard rules

**1. Never rename `zenith_*` localStorage keys or the `"Zenith Uploads"` Drive
folder.** They look like leftover branding after the Zenith → O-Zenith rebrand,
but renaming wipes every existing user's files, API keys and subscription, or
orphans everything they've synced. Users never see either string.

**2. Never hard-code a tool count.** `src/data/toolsData.ts` is the single
source of truth and exports `TOTAL_TOOLS`, `toolCountByCategory`,
`categoryName()`, `countTools()`. Counts had drifted badly before being derived
(Editing said 21 for 20; the free tier said 43 for 40).

**3. Styling is inline `style={{…}}` + CSS variables. There is no Tailwind.**
A CSS framework was installed for one component and removed with it — that
component was the only Tailwind consumer in the repo, so 7 deps and 4 config
files had no purpose. Don't reintroduce one for a single component.

**4. The hover/glass layer must never override a control's own colour.** Several
attempts (gradient buttons, liquid glass) replaced every button with one fixed
palette and destroyed the semantic colour system — green success, red danger,
purple AI. Hover *brightens* (`filter: brightness(1.07)`); it does not recolour.

**5. Don't claim things the product doesn't do.** "Client-side encryption" was
removed from the marketing copy: privacy here comes from never uploading, not
from encrypting. Check `docs/DECISIONS.md` before adding any capability claim.

---

## Architecture in one breath

- **No backend.** All state is `localStorage`, scoped per account uid.
- **Cross-device sync** rides on the user's own Google Drive: a private
  `o-zenith-account.json` in the app folder mirrors subscription + API keys.
  `src/utils/accountSync.ts`. `syncAccountNow()` pulls then pushes, so it's
  convergent and safe to run on every boot.
- **Google sign-in also grants `drive.file`**, so Drive links automatically —
  there is deliberately no second "connect Drive" prompt. Tokens last ~1 hour;
  expiry is a *session refresh*, not an unlink, and the UI says so.
- **Gating:** API keys are PRO-only; the Storage tab requires a linked Drive;
  free tier is 3 uses across Edit & Convert.
- **95 tools → 58 components.** Many tools share one implementation.
  `ToolWorkspace.tsx` switches on a slug derived from the tool name.

---

## Things that will bite you

- **Inline styles outrank the stylesheet.** Global refinements to buttons/cards
  need `!important`, because many components set `transition`/`boxShadow`
  inline.
- **Grid items need `min-width: 0`.** A grid item's automatic minimum is its
  content, so one long label widens its own track past its siblings.
- **`backdrop-filter` creates a containing block** for `position: fixed`
  descendants — a fixed child of a blurred ancestor gets captured.
- **Measuring contrast in the browser:** resolve colours through a canvas 1×1
  fill. `getComputedStyle` returns `color(srgb 0.47 …)` **0–1 floats** for
  `color-mix()`, and reading those as 0–255 gives nonsense. Also wait ~1.5 s
  after load — entrance animations and the 0.25 s theme transition cause false
  readings.
- **Touch hit-area overlays steal taps from nested controls.** On touch
  screens, leaf controls get an invisible `::after` (inset −6px) to reach 44pt.
  A clickable card with its own buttons inside (tool card + heart) must not
  get one, or every tap opens the card — the rule uses `:not(:has(button…))`.
  Script `.click()` tests can't see this; tap on a device or the simulator.
- **Only ~3 of ~439 clickable-looking elements are real `<button>`s.** The rest
  are divs and anchors. Don't apply button geometry to `cursor: pointer` divs;
  it squashes cards and clips text.

---

## Known-real vs noise

`npm audit` reports 6 vulnerabilities. **Four don't apply** (`tar` and
`node-pre-gyp` arrive via `pdfjs-dist → canvas`, an optional Node-only dep
verified absent from `dist/`; the react-router advisory is RSC-mode CSRF and
this is a client SPA — npm's suggested "fix" is a *downgrade* that reintroduces
a patched open-redirect).

**Two are real**, both parsing untrusted user files: `pdfjs-dist` (needs a
3.11 → 6.2 major across 21 files) and `xlsx` (no npm fix; SheetJS moved off npm;
used in 2 files). See `docs/DECISIONS.md`.
