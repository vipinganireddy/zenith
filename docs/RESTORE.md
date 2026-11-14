# Restoring on a new machine

The whole project is self-contained in this folder. Nothing lives outside it.

---

## What to upload

Upload the folder **as-is**, with two optional exclusions that save ~416 MB and
are regenerated automatically:

| Folder | Upload it? | Why |
|---|---|---|
| `node_modules/` | **No** | 411 MB, platform-specific binaries. `npm install` rebuilds it exactly from `package-lock.json` |
| `dist/` | **No** | 5 MB build output. `npm run build` regenerates it |
| everything else | **Yes** | Source, config, `.env`, `.git`, docs |

Uploading them anyway is harmless — just slow, and `node_modules` built on
macOS may not run on Windows/Linux. Delete and reinstall if you hit native
module errors.

> **Do include `.git/`.** It carries your full history and the GitHub remote.

---

## Steps

```bash
cd "Zenith Claude"
npm install
npm run dev          # http://localhost:5173
```

Verify:

```bash
npm run build                                # must end "✓ built in …"
node --test src/utils/fileLibrary.test.ts    # must be "pass 7 / fail 0"
```

Then open Claude Code in this folder. `CLAUDE.md` is picked up automatically,
so Claude starts with the project's conventions, hard rules and gotchas.

---

## Requirements

- **Node 22+** (built and tested on **v26**). The test file relies on Node's
  native TypeScript stripping (`node --test` on a `.ts` file) — on older Node it
  fails to parse. Everything else works on 22+.
- npm 10+.

---

## Google sign-in after the move

**It keeps working — no re-setup needed.** `.env` is committed and holds
`VITE_GOOGLE_CLIENT_ID`. An OAuth **Client ID is public by design** (it ships in
the client bundle); it is not a secret.

`.env.local` is git-ignored and won't travel. That's fine — it only ever
mirrored the same value, and `.env` covers it.

One thing to check if you serve from a **new domain**: add that origin and its
three redirect URIs in Google Cloud Console, or you'll get
`redirect_uri_mismatch`. See [GOOGLE-SETUP.md](GOOGLE-SETUP.md).

---

## What does *not* travel (by design)

All user state lives in the **browser's** `localStorage`, not in this folder —
accounts, files, favourites, API keys, subscription. A new machine starts empty.

For a real user, the recovery path is Google sign-in: `accountSync` restores
their subscription and API keys from the private mirror file in their own Drive,
and the Files page re-lists their synced documents. See
[ARCHITECTURE.md](ARCHITECTURE.md#account-sync).

---

## Housekeeping

`Zenith/` is an abandoned empty clone — one `.gitattributes`, a single "Initial
commit", pointing at a **different** repo (`shadowxbooster/Zenith`, while this
project is `shadowxbooster/Zenith-Claude`). It holds no project code, and a
nested `.git` can confuse tooling.

Safe to delete once you're sure you don't want that repo link:

```bash
rm -rf Zenith
```
