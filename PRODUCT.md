# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O-Zenith serves three overlapping audiences, all doing PDF work directly in the browser:

- **Everyday consumers** who occasionally need to edit, convert, or sign a PDF and want a free, no-signup-hassle tool.
- **Privacy-conscious professionals** (legal, accounting, HR, healthcare, and similar) handling sensitive documents who specifically need a tool that never uploads files to a server.
- **Power users / prosumers** (students, freelancers, small business owners) doing frequent PDF work who want a full toolkit in one place instead of juggling several single-purpose sites.

## Product Purpose

O-Zenith is an AI-powered PDF workspace: a single browser-based app for editing, converting, organizing, compressing, securing, signing, and AI-processing PDFs, plus Google Drive backup. Success means a user can complete their PDF task entirely in-browser, without uploading a file anywhere, and without needing a second tool.

## Positioning

Two things a competitor (iLovePDF, Smallpdf, Adobe) can't both truthfully claim at once, weighted equally:

- **100% client-side privacy** — all 96 tools run in-browser (pdf-lib, tesseract.js, and similar libraries); files are never uploaded to an O-Zenith server.
- **Breadth in one app** — 96 tools across 7 categories (AI, PDF Editing, Convert to/from PDF, Organize, Scan & Media, Productivity), so users don't need to juggle multiple single-purpose PDF sites.

## Operating Context

- Single-page app (Vite + React + TypeScript), no backend.
- Public marketing pages (Home, Features, Pricing, About, Blog, Contact, Terms, Privacy) alongside an authenticated dashboard (Dashboard Home, Tools, Tool Workspace, Files, AI Workspace, Favorites, Subscription, Profile).
- AI tools are bring-your-own-API-key (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek); keys stay in the browser, never sent to an O-Zenith server.
- Google Sign-In connects Google Drive; uploads in the Files page auto-sync to a "O-Zenith Uploads" Drive folder, and deletes remove from Drive too.
- Files manager: multi-select + bulk actions, live time-spent tracking, favorites, light/dark themes.
- All state (files, history, favorites, API keys, Drive tokens) lives in browser `localStorage` — intentionally no shared database or cross-device/cross-user sync.

## Capabilities and Constraints

- 96 working tools across 7 categories, implemented per-tool under `src/pages/dashboard/tools/`.
- Free / PRO plans: Free gives 3 uses of Edit & Convert tools; PRO unlocks everything.
- No backend/server component; deploy target is Vercel (static Vite build + SPA rewrite).
- Google OAuth Client ID is public by design (ships in the client bundle).
- Because state is `localStorage`-only, there is no cross-device sync and no server-side backup outside of the optional Google Drive connection.

## Brand Commitments

Name: O-Zenith. Tagline: "AI-Powered PDF Workspace."

## Evidence on Hand

None beyond the codebase and README (no testimonials, case studies, press, or benchmark data on hand — future work must not fabricate these).

## Product Principles

1. Privacy is architectural, not a claim — no PDF operation may require uploading the file to a server.
2. Breadth without fragmentation — 96 tools should feel like one coherent workspace, not 96 disconnected micro-apps.
3. Serve the full spectrum from casual one-off use (Free tier, no friction) to frequent power use (PRO, full toolkit) without alienating either.
4. AI features stay opt-in and user-owned (bring-your-own-key) rather than an O-Zenith-hosted dependency.

## Accessibility & Inclusion

Undecided — no formal accessibility standard has been set for this project yet.
