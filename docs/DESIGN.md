# Design system: "Paper & Ink" (light) and "Obsidian" (dark)

The aim is a calm, premium, tactile and warm feel. Every value below is a rule.
Tokens live at the top of `src/index.css`. Components use inline
`style={{…}}` that reference CSS variables. The variables flip under
`[data-theme="dark"]`, so theming never touches a component. There is no
Tailwind (CLAUDE.md rule 3).

Legacy names (`--primary`, `--card-bg`, `--text-muted`, `--border-color`, …)
are **aliases** of the tokens below. Every older component re-themes through
them. New code should use the semantic names.

---

## 1 · Colour

| Token | Light (Paper & Ink) | Dark (Obsidian) |
|---|---|---|
| `--canvas` | `#F9F9FC` | `#131313` |
| `--surface` | `#FFFFFF` | `#1E1E1E` |
| `--surface-high` (tracks, chips, disabled) | `#E8E8EA` | `#353534` |
| `--surface-sunken` (fields, inset tiles) | `#F3F3F6` | `#0E0E0E` |
| `--ink` / `--ink-muted` / `--ink-faint` | all `#2B1A0E` | `#E5E2E1` / `#C8C7C6` / `#918F8F` |
| `--outline` (only ever at 15%) / `--hairline` | `#D9B6A6` / 15% | `#444748` / 15% |
| `--placeholder` / `--chevron` | `#8A5A40` / `#C59177` | `#8A8887` / `#6F6D6D` |
| `--accent` / `--on-accent` | `#2B1A0E` / `#FFF` | `#F7D44C` / `#2A1D00` |
| `--danger` / `--danger-bg` | `#BA1A1A` / `#FFDAD6` | `#FF453A` / `#5C1410` |
| `--good` `--warn` `--bad` (status) | `#2FB36B` `#E8A33A` `#E5484D` | same |
| `--cat-*` (data viz, tool icon chips) | activity, energy, heart, sleep, vitals, body, water, mind, strain | same |

Rules:
- **One accent per theme.** Selected states, primary actions and links use the
  accent. Tints are `color-mix(in srgb, var(--accent) N%, transparent)`.
- **No 1px lines** except 15% hairlines. Layers are separated by tone: canvas,
  then surface, then sunken or high.
- **Danger is for destructive actions and errors only.**
- Hover **brightens** (`filter: brightness(1.07)`). It never recolours
  (CLAUDE.md rule 4).

## 2 · Type

Fonts are self-hosted through `@fontsource` in `main.tsx`, one file per weight.
Syne 600/700/800 is the display face; Epilogue 400–700 is the text face.
Utility classes are `.t-caps` … `.t-hero`.

| Tier | Size/line | Notes |
|---|---|---|
| caps | 12/16 | uppercase, +1.2 tracking; eyebrows, labels, tab labels |
| sub | 14/20 | |
| body | 16/24 | default; inputs are always 16 so iOS never zooms |
| lead | 20/28 | −0.2 tracking |
| title | 24/32 | Syne |
| headline | 32/40 | Syne 800; screen headings |
| metric | 48/58 | |
| hero | 80/94 | |

All inline `fontSize` values were snapped to these tiers. Copy is in sentence
case.

## 3 · Space, shape and depth

- **Spacing:** gutter 24, stack 16, section 48 (`--gutter`, `--stack`,
  `--section`). Phone screens use 24pt side gutters.
- **Radii:** 8 / 12 / 16 / 24 / full (`--r-micro` … `--r-full`). Cards use 24,
  inner tiles and fields 16, chips 12.
- **Touch targets:** at least 44pt.
- **Depth:** tonal first. `--shadow-raised` is `0 8 24` brown at 6% in light
  and `0 12 40` ink-tinted at 6% in dark. `--shadow-floating` is for the tab
  island and menus.

## 4 · Components

| Component | Where | Spec |
|---|---|---|
| Primary button | `.btn-primary`; full-width tool actions are matched automatically in `.tool-content` | 56 high, radius 24, accent fill, `--highlight-top` in light; disabled is surface-high with ink-faint text |
| Secondary button | `.btn-secondary` | same shape on surface-high |
| Segmented control | `.segmented` with `role="tab"` / `aria-selected` | surface-high track, radius 16, padding 4; accent pill radius 12 |
| Text field | `.field-label` + global input rule; `.auth-form` forces 56 high | sunken fill, no border at rest, 1.5px accent inset on focus |
| App bar (phones) | `DashboardLayout` | tab roots: caps eyebrow over a Syne 32 headline, with round 44pt icon buttons. Account is the avatar button. Pushed screens: a round back button and a 20pt title |
| Tab island (phones) | `DashboardLayout` | 4 tabs (Home, Tools, AI, Files), floating low at `--island-bottom` (22pt from the bottom edge on Face ID iPhones, clear of the home indicator; 24pt side gaps), pill, 64 high; glass `blur(24px) saturate(190%)` with `--island-rim`; the accent bead slides on the spring; a `<nav>` of links with `aria-current="page"` |
| Hero card | `DashboardHome` | plan ring (`components/ui/Ring.tsx`), accent glow, legend of real usage only |
| Chat | `AIWorkspace` | accent user bubble and sunken assistant bubble, radius 24 with an 8 tail corner; gradient-disc coach avatar; pill composer |
| Tools filter (phones) | `ToolsFilter.tsx`, route `/dashboard/tools-filter`; state in `utils/toolFilters.ts` | pushed page: category radio list with counts, sort and layout segmented controls; pinned Reset / Done bar. Edits a draft; only Done applies. Category and sort travel in the URL (`?cat=&sort=`); the Tools screen shows a badge on the filter button and removable chips |
| Tool frame | `ToolWorkspaceLayout` (all tools) | phones: description + heart (the app bar has the title), **Choose from Files**, then one 24-radius surface. Desktop: back link, Syne title, Choose from Files + Save |
| Tool internals (phones) | `.tool-content` rules in `index.css` | panes lose grey fill and drop to 16px padding; padded white settings cards go flat; drop zones are sunken with a soft dashed edge; fields 48 high and borderless; buttons ≥44, full-width actions 56/24; option grids two-up; chips filled with an accent ring when chosen; in-tool headings use Epilogue |
| Choose from Files | `components/tools/FilesPicker.tsx` | sheet listing library files that match the tool input's `accept`; hands the bytes to the tool's own `<input type=file>` (assigned + change event), so no tool needs its own code |
| Save to… | `Files.tsx` | on upload (web): **This device** (IndexedDB, `utils/fileStore.ts`) or **Google Drive** when linked (PRO); a failed Drive upload falls back to the device. The native apps save straight to the device |
| Folders (Files) | `Files.tsx`, `zenith_folders` | app-level folders: tap to open (back chevron + name), **Move to…** sheet from a file's menu or the selection bar, rename / delete (files return to All files). Uploads made inside a folder land there. Folders organise O-Zenith only; Drive files stay in "Zenith Uploads" |
| Edit menu (Files) | `Files.tsx` | one round pencil button beside the list heading replaces New folder / Select all. Sheet rows: Select files, New folder (root), Star / Unstar all, Move all to folder…, and inside a folder Rename, Password…, Delete folder; in Trash, Restore all / Empty trash |
| Folder passwords | `folderLock.ts` | optional on create, or later via Password…. Stores only a salted PBKDF2-SHA-256 hash in the folder record (this device). Needed to open, move files in, rename, change/remove the password, delete. Closed locked folders hide their files from lists, counts, search, Starred, Trash and every picker. Unlock lasts until you leave the folder. Copy says plainly that files are **not encrypted** |
| Files picker | `FilesPicker.tsx` | bottom sheet used by every tool and by Chat ("Choose a file"). Folders open in place; locked ones ask for the password inline. Chat adds a "From this device" row |
| Keyboard-aware sheets | `useKeyboard.ts` | native Keyboard plugin `resize: 'body'`. `--vvh` = space above the keyboard, `--kb` = keyboard height. Fixed bottom sheets pad by `max(safe-area, --kb)` — the window they're fixed to doesn't shrink, so without it a sheet with a text field sits under the keyboard |
| Chat streaming | `aiService.ts` `callAIStream` | replies stream token by token (SSE) for every provider, coalesced to one render per frame; message bubbles are memoised so typing doesn't re-render the thread |
| File viewer | `components/files/FileViewer.tsx` | full-screen, tap any file: PDF (pdf.js pages), images incl. HEIC, video, audio, Word, PowerPoint, Excel/ODS/CSV (sheet tabs), Markdown, JSON, HTML, text & code, ZIP (contents list); others get Share/Download. Converted documents render in a sandboxed, script-less, offline iframe |
| Storage chip | `Files.tsx` row | *On device* / *Google Drive* / *Device · Drive* / *Uploading to Drive…* / *Not stored* |
| Overlays | sheets, viewer, picker | portalled to `<body>`: the page container is its own stacking layer and would trap them under the app bar |
| Toast | `hooks/useToast.ts` | one at a time, surface card with a tinted tone disc, above the tab island; text only (never HTML) |
| Empty state | e.g. Home → Recent activity | icon in a tinted circle, a title, one sentence, one action |

## 5 · Motion

There is one spring: damping 18, stiffness 260, mass 0.6. It is baked into
`--ease-spring` (a CSS `linear()` curve) with `--dur-spring: 420ms`. Presses
scale to 0.97 and fade slightly; cards scale to 0.98. Rings sweep in
(`.ring-arc`). Under `prefers-reduced-motion`, durations collapse and press
scaling is off.

## 6 · Accessibility

Text meets AA in both themes. It was measured by sweeping the main screens and
several tools with a canvas-resolved contrast script, waiting past the theme
transition. Icon-only controls carry `aria-label`.

## Deliberate deviations

- **Light `--success` is `#1F7A47`.** It is used for green *text*, because
  `#2FB36B` on paper is about 2.6:1. `--good` keeps the spec value for fills
  and charts.
- **Disabled buttons in dark** (ink-faint on surface-high) measure 3.8:1. That
  is the spec's disabled style, and WCAG exempts inactive controls.
- **Google Drive buttons use `#1A73E8`**, Google's darker brand blue, because
  white on `#4285F4` is 3.6:1.
- **Icons are Lucide, not MDI.** Swapping the icon library across ~110 files
  would add no visual value. The active tab is shown with the bead and a
  heavier stroke.
- **Colours that are document content are kept as hex.** That covers canvas
  and PDF drawing colours (watermarks, e-sign ink, page backgrounds), Google
  and AI-provider brand marks, and white text over camera or photo scrims.
- **The auth brand plate** (desktop left panel) uses fixed colours: ink-brown
  plate, white text and gold highlights. It reads the same in both themes.
