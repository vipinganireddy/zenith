# Architecture

O-Zenith is a **single-page app with no backend**. Vite + React 19 + React
Router + TypeScript. ~24,000 lines across ~110 source files.

---

## Layout

```
src/
  main.tsx, App.tsx        Entry + route table
  index.css                Whole design system (tokens, themes, controls)
  components/
    layout/                PublicLayout (marketing), DashboardLayout, AuthLayout
    tools/                 Shared tool chrome (ToolWorkspaceLayout, SaveToDriveButton…)
    ui/                    footer.tsx, social-icons.tsx
  context/
    AuthContext            Accounts, session, Google sign-in
    SubscriptionContext    Plan tiers, free-use metering, category gating
    FavoritesContext
  data/toolsData.ts        SINGLE SOURCE OF TRUTH for tools + derived counts
  pages/
    public/                Home, Features, Pricing, PublicTools, Blog, About,
                           Contact, Terms, PrivacyPolicy
    auth/                  Login, Register, ForgotPassword
    dashboard/             DashboardHome, Tools, ToolWorkspace, Files,
                           AIWorkspace, Favorites, Subscription, Profile
    dashboard/tools/       58 tool components serving all 95 tools
  utils/
    toolsData ← counts     accountSync, apiKeys, googleDrive, fileLibrary,
                           aiService, activityTracker, sanitize, pdfWorker
```

**Styling is inline `style={{…}}` driven by CSS variables.** There is no
Tailwind and no CSS-in-JS. Theming works because every inline style references a
token (`var(--card-bg)`, `var(--primary)`) that flips under
`[data-theme="dark"]`. Global refinements hook onto those tokens with attribute
selectors like `[style*="--card-bg"]`, since inline styles keep the literal
token text in the DOM.

---

## Tool routing

`toolsData.ts` holds all 95 tool definitions. A tool's id is derived from its
name (`name.toLowerCase().replace(/\s+/g,'-')`). `ToolWorkspace.tsx` switches on
that id to a concrete component; anything unmatched falls through to
`UniversalTool`, which renders one of three experiences based on category:

- **AI category** → `AIPdfTool` (upload → prompt → markdown result)
- **Chat tools** → `ChatPdfTool` (conversational: Ask Questions, Explain, Smart Search, Research, Study). "Chat with PDF" was removed — the Chat tab covers it
- **Otherwise** → an informational screen

All 95 tools resolve to a working path. 58 components cover them because many
tools share one implementation (e.g. bulk-merge → `MergePDF`).

### Derived counts

`toolsData.ts` exports `TOTAL_TOOLS`, `toolCountByCategory`, `categoryName()`,
and `countTools()`. Every "N tools" string on the site reads from these. They
were previously hard-coded per page and had drifted — PDF Editing advertised 21
(really 20), Convert to PDF 11 (9), Organize 11 (10), Scan & Media 9 (8), and
the free tier "43 tools" (40). Never re-hard-code a count.

---

## Data model

Everything is `localStorage`, **scoped per account** so signing out and back in
(or switching accounts on a shared browser) never leaks or loses data.

| Key | Holds |
|---|---|
| `zenith_users` | Registered accounts (SHA-256 password hashes via Web Crypto) |
| `zenith_session` | Current session `{ id, name, email, … }` |
| `zenith_subscription__<uid>` | Plan, activation, expiry |
| `zenith_free_used_tools__<uid>` | Which tools consumed a free use |
| `zenith_apikey_<provider>__<uid>` | BYO AI keys |
| `zenith_files` | Files-page records (`src/utils/fileLibrary.ts`) |
| `zenith_favorites`, `zenith_recent_tools`, `zenith_time_spent` | Usage state |
| `zenith_gd_token`, `zenith_google_drive`, `zenith_gd_folder_id`, `zenith_gd_syncfile` | Drive session + ids |
| `zenith_dark`, `zenith_avatar`, `zenith_tools_cols` | UI preferences |

Legacy un-scoped keys are migrated into the account on first read, then removed
so a second account can't inherit them.

> Storage keys deliberately keep the `zenith_` prefix after the O-Zenith
> rebrand. Renaming them would wipe every existing user's files, keys, and
> subscription on next load.

---

## Google Drive

`src/utils/googleDrive.ts`. Implicit OAuth (`response_type=token id_token`) —
no backend, so no code exchange. Scope is `openid email profile
.../auth/drive.file`, which only reaches files this app created.

- `ensureAppFolder()` — finds/creates **"Zenith Uploads"**, caches the id
- `uploadFileToAppFolder()` — used by the Files page *and* `SaveToDriveButton`,
  so tool output and manual uploads land together
- `listAppFolderFiles()` — lets cloud files appear in the Files page on a fresh
  browser (merged by `driveId`, so nothing duplicates)
- `fetchDriveQuota()` — real Drive used/total/free for the Storage tab
- Tokens last ~1 hour. Expiry is a **session refresh**, not an unlink — the UI
  says so rather than showing the first-time connect pitch.

> The folder name is also frozen at "Zenith Uploads": the app finds it by name,
> so renaming would orphan everything users already synced.

<a name="account-sync"></a>
## Account sync (cross-device)

`src/utils/accountSync.ts`. With no backend, `localStorage` is per-browser —
which is why a PRO member on a second browser looked like a free user with no
keys. Fix: mirror account state through the user's **own Drive**.

A private `o-zenith-account.json` in the app folder carries `{ subscription,
apiKeys }`. `drive.file` covers files this app created on *any* device, so
browser B can read what browser A wrote. The file is filtered out of the Files
listing — it's plumbing, not a user document.

- `syncAccountNow(uid)` — pull, then push the union. Convergent, so it runs on
  every app boot (`SubscriptionContext`) and from a manual **Sync now** button.
- `pullAccountSyncSafe(uid)` — awaited during Google sign-in *before* the
  session commits, so the UI mounts already knowing the plan. Bounded (6 s) and
  never throws; login can't hang on sync.
- Merge rules that cannot downgrade: a key typed on this browser wins over
  remote; a paid plan is only ever adopted, never replaced by "free".

**Limits:** restore only happens on **Google** sign-in (email/password login has
no Drive token to pull with), and the initial publish needs a live Drive session.

---

## Testing & verification

```bash
npm run build                                  # tsc -b + vite build
node --test src/utils/fileLibrary.test.ts      # 7 tests, no framework
```

`fileLibrary.test.ts` uses Node 26's native type stripping and a `localStorage`
stub — no framework, no build step. It covers the id-collision case (a tool
emitting several files in the same millisecond would collide on `Date.now()`).
