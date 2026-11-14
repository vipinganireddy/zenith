# Decisions & known limitations

Why things are the way they are — and what genuinely does not work, so nobody
re-discovers these the hard way.

---

## Frozen identifiers (do not rename)

The app rebranded **Zenith → O-Zenith**. Two things deliberately kept the old
name:

1. **`zenith_*` localStorage keys.** Renaming wipes every existing user's files,
   API keys, favourites and subscription on next load.
2. **The "Zenith Uploads" Drive folder.** The app locates it *by name*;
   renaming orphans everything users already synced.

Both are internal identifiers users never see.

---

## No backend — what that costs

`localStorage` is per-browser, so without a server:

- **Account sync** rides on the user's own Google Drive
  (`docs/ARCHITECTURE.md#account-sync`). It works, with two limits: restore only
  happens on **Google** sign-in (email/password login has no Drive token), and
  the first publish needs a live Drive session.
- **OAuth tokens last ~1 hour** and cannot be refreshed silently. The UI treats
  expiry as a *session refresh*, not an unlink.
- **The contact form has no delivery path.** It previously showed "sent" while
  doing nothing. It now opens the user's mail client addressed to
  `shadowxbooster@gmail.com` with the message prefilled. Silent server-side
  delivery needs a service (Formspree, Resend, a serverless function).
- **Payments are not verified.** Subscription → Upgrade opens a Razorpay link,
  then activates PRO for *any* non-empty Payment ID typed in — nothing checks it
  against Razorpay. Anyone can unlock PRO for free. Real verification needs a
  server (a serverless function calling Razorpay's payments API or a webhook).
- **Passwords** are SHA-256 hashed via Web Crypto and stored locally. That is
  not a substitute for real server-side auth with a slow KDF (bcrypt/argon2).

---

## Support contact

All support, legal and privacy contact routes to **shadowxbooster@gmail.com**
(Terms, Privacy Policy, Contact page, footer). The previous
`support@ / privacy@ / legal@zenith.app` addresses were placeholders.

---

### In-app Support & Policies (Account)

Account → **Support** (contact via `mailto:` — the user sees the draft before
it's sent; a problem report pre-fills platform + user agent, nothing else —
plus common questions) and **Policies** (a plain-language summary, then the
full Privacy Policy and Terms rendered *inside* the app at `/dashboard/privacy`
and `/dashboard/terms`, so the native app never lands on the marketing header).

The Policies summary describes what the code actually does: no O-Zenith
servers, Drive only when linked (plus the `o-zenith-account.json` sync file),
AI text goes straight to the user's own provider, no ads or analytics code,
folder locks aren't encryption. Keep it in step with the code, not with the
long-form legal pages — those still describe analytics, session cookies,
servers and an email service that don't exist, and need a legal pass.

---

### App mode: no website inside the app

`src/utils/appMode.ts` — the iOS/Android app, the installed home-screen app,
or any phone-width screen. In app mode the marketing website never appears:
its routes (`/`, `/features`, `/pricing`, `/about`, `/contact`, `/blog`,
`/tools`) redirect into the app, and `/privacy` · `/terms` open the in-app
`/legal/:doc` screen (back button + title, no website header/footer).
Signed-out users start on `/welcome` (intro with Sign in / Create an
account), then the cardless Sign in, Create account and Reset password
screens (`components/auth/AuthKit.tsx`). Plans is an app screen, not a
pricing page. Desktop web keeps the website.

---

## Gating rules

- **API keys are PRO-only.** Free users see an upgrade card.
- **The Storage tab requires a linked Google Drive.** Without it, a connect
  prompt; with it, the donut shows **real Drive quota** (used / total / free,
  handling Workspace's unlimited accounts), and the localStorage breakdown sits
  below as "App data on this device".
- **Free tier** = 3 uses within Edit & Convert (40 tools).

---

## Copy that was corrected

Claims previously on the site that were not true:

- **"client-side encryption"** — privacy comes from never uploading, not from
  encrypting. Replaced with what actually ships: password-protect, redact,
  strip metadata.
- **"50+ PDF Tools"** on the auth page while every other surface said 96.
- **Per-category counts** had drifted (see `docs/ARCHITECTURE.md`). Now derived.
- **Copyright/company** is Orithe Business Software PVT LTD.

`PRODUCT.md` still says **103 tools** in places; the code says **95** (96 until "Chat with PDF" was removed in favour of the Chat tab). Reconcile
before making external claims.

---

## Document engines (how the tools actually work)

Everything runs in the browser; these are the shared engines under `src/utils/`.
Most "why is it done this way" questions are answered here.

| Engine | Used by | Why this way |
|---|---|---|
| `htmlToPdf.ts` | Word, HTML, Text, CSV, Excel, EPUB, PowerPoint → PDF | Layout happens in a **sandboxed, script-free iframe**; pdf-lib then draws the measured words as **real, selectable vector text**. The old html2pdf.js path screenshotted the page — 3.6 MB files, no text, and (the bug that started this) **images dropped from Word documents**. |
| `docxToHtml.ts` | Word → PDF | `docx-preview` plus a fix-up so headers/footers inherit across sections and "next page" section breaks become page breaks. |
| `pdfText.ts` | every tool that writes text into a PDF | Font chain: standard font → **DejaVu Sans** (subset; Noto Sans was tried and pdf-lib's subsetter broke its glyphs) → rasterised image for shaped scripts (Devanagari, Arabic…), which no PDF font path here can shape. `visualFrame()` maps "what the user sees" to PDF coordinates through **CropBox and /Rotate** — skip it and stamps land off-page on rotated scans. |
| `qpdf.ts` (qpdf WASM) | Protect, Restrict, Unlock, Repair | Real **AES-256** encryption and permissions, and real decryption, so unlocked files keep their text. pdf-lib cannot encrypt or decrypt. qpdf writes its stderr through `console.error`; that is not an app error. |
| `pdfImageCompress.ts` | Compress, Reduce Resolution | Recompresses the images *inside* the PDF (text stays vector). Masks and CMYK images are skipped deliberately; output is **never larger** than the input. |
| `pdfFlatten.ts` | Flatten | Vector flatten (forms + annotation appearances) by default; raster only on request. Links are kept. |
| `pdfToDocx.ts` | PDF → Word / HTML / Excel | Reconstructs headings, paragraphs, lists, rows and images from pdf.js text runs. **Limitation:** table detection is heuristic — cells pdf.js merges into one run stay merged. |
| `pdfWatermark.ts` | Add / Remove Watermark | Add Watermark tags its stamp as `/Artifact <</Subtype /Watermark>>` marked content (the PDF-standard tagging Acrobat and Word use). Remove Watermark deletes exactly that tagging, "Watermark" layers, Acrobat watermark XObjects and Watermark annotations. **A watermark that is part of a scanned image or drawn as plain text cannot be removed** — the tool says so instead of guessing. |
| `removeBackground.ts` | Remove Background | Flood fill from the image border with a colour tolerance and feathered edge. **Plain backgrounds only** (products, logos, signatures). Busy photo backgrounds would need an ML segmentation model; the UI says so. |
| `pdfJpegImages.ts` | Extract Images | Embedded JPEG photos are returned **byte-for-byte** (transport filters like ASCII85 unwrapped). Re-encoding them as PNG made a 2 MB photo 8 MB. Images with masks, CMYK or other colour spaces are decoded to PNG instead. |
| `links.ts` | Add Hyperlinks, Resume Builder | Turns typed input into `https:`, `mailto:` or `tel:` links and **refuses every other scheme** (no `javascript:` links inside a PDF). Links are real `/Link` annotations with URI actions. |
| Redact PDF / Whiteout | — | Redacted pages are **rebuilt as 200-DPI images** so the text under a box is actually gone (a drawn box over live text is not redaction). Words clearly outside every box are written back as an **invisible text layer**, so the page stays searchable. Word positions are estimated, so words within a few characters of a box are dropped from that layer on purpose: losing a searchable word is acceptable, leaking a redacted one is not. Other pages are untouched. |
| PDF → Word / HTML / EPUB | — | Opaque photos are stored as JPEG (transparent graphics stay PNG); a photo-heavy EPUB went from 9.9 MB to 1.6 MB. EPUB output is EPUB 3 with a nav document, as readers and validators require. |
| eSign | — | Draw, type (handwriting fonts fetched from Google Fonts on first use, which the CSP already allows) or upload a photo of a signature, whose paper background is made transparent. The pad must stay **transparent**: an opaque pad would stamp a white box over the document. |

pdf.js renders everywhere use `intent: 'print'`: the display intent waits on
`requestAnimationFrame`, which browsers pause in background tabs — jobs
silently stalled when users switched tabs.

---

## Dependency security

`npm audit` reports **6 vulnerabilities**. Four are **not exploitable here**:

| Package | Why it doesn't apply |
|---|---|
| `tar` (critical), `@mapbox/node-pre-gyp` | Reached via `pdfjs-dist → canvas`, an **optionalDependency** for Node/SSR. Verified absent from every `dist/` bundle |
| `react-router` / `-dom` | The advisory is **RSC-mode CSRF**; this is a client-side SPA with no server components |

> npm's suggested "fix" for react-router is a **downgrade to 7.11.0**, which
> would reintroduce an open-redirect that was already patched. Ignore it.

**Two are real** — both parse untrusted user files in the browser:

- **`pdfjs-dist` (high, arbitrary JS execution).** Fix requires **3.11 → 6.2**,
  a major upgrade across 21 files including worker setup.
- **`xlsx` (high, prototype pollution).** **No fix on npm** — SheetJS abandoned
  the npm package and publishes to its own registry. Used in 2 files
  (`PdfToExcel.tsx`, `ExcelToPdf.tsx`).

---

## Toolchain

Tailwind + shadcn were installed for one component, then removed with it: that
component was the **only** file in the repo using Tailwind classes, so 7
dependencies and 4 config files had no consumer. Everything is inline styles +
CSS variables. The `@/` alias was kept (`vite.config.ts` + `tsconfig.app.json`)
because `footer.tsx` imports through it.

**Don't reintroduce a CSS framework for a single component.**

---

## Outstanding

- Impeccable design critique never completed (session limit) — rerun
  `/impeccable critique`.
- Several tool components have **no Save-to-Drive button**, including
  `AIInvoiceReader`, `QuizGenerator`, `ComparePdfs`. Their output can only be
  downloaded locally. (`AISummarizePDF` and `AITranslatePDF` gained one via
  `hooks/useTextObjectUrl.ts` — reuse it for the other text-output tools.)
- **SVG → PDF is rasterised** (300 DPI at print size): shapes and text in the SVG are not vector or selectable in the PDF. A vector path needs an SVG→PDF renderer (e.g. svg2pdf.js + jsPDF), a second PDF stack.
- **PDF → Word / Excel tables** are heuristic (see Document engines). Complex
  merged-cell tables may need manual touch-up.
- Unlock PDF falls back to re-rendering pages as images only when qpdf cannot
  decrypt the file; the normal path keeps text.
- Social links in the footer are `#` placeholders pending real account URLs.
  WhatsApp format is `https://wa.me/<countrycode><number>`.
- Google consent screen still displays "Zenith" (set in Google Cloud, not code).

## Owner account and email-only sign-in

- **Phone/OTP sign-in was removed.** Login offers email + password (and Google on
  the website). The OTP was a demo — the code was shown on screen, not sent by SMS —
  so it was never a real second channel.
- **`src/config/ownerAccounts.ts`** defines built-in owner accounts that are always
  PRO (no expiry, no free-use limit). The account is created on a device the first
  time it signs in; its plan is *derived* in `SubscriptionContext` (never stored or
  synced), so it can't leak to another account. Only a SHA-256 hash of the password
  is in the source, but the file ships to every browser: treat the email as public
  and use a long password — a short one is recovered from its hash instantly. This
  grants nothing beyond what any user could already do, since plan checks run
  client-side (there is no backend).
