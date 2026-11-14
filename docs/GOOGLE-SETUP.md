# Google Sign-In & Drive setup

O-Zenith uses Google for **both** sign-in and Drive backup in one consent — the
same OAuth response yields an `id_token` (identity) and an `access_token`
(Drive). That is why users are never asked to "link Drive" separately.

---

## 1. Environment variable

```bash
VITE_GOOGLE_CLIENT_ID=<your-id>.apps.googleusercontent.com
```

Lives in `.env` (committed, built into Vercel automatically) and `.env.local`
(git-ignored, local override).

An OAuth **Client ID is public by design** — it ships in the client bundle and
is not a secret. A client *secret* must never enter this repo; the implicit flow
does not use one.

---

## 2. Authorized JavaScript origins

Google Cloud Console → **APIs & Services → Credentials** → your OAuth 2.0
Client ID:

```
http://localhost:5173
https://<your-production-domain>
```

## 3. Authorized redirect URIs

The app redirects back to **three different paths** depending on where the flow
started. All must be registered, for both environments:

```
http://localhost:5173/login
http://localhost:5173/register
http://localhost:5173/dashboard/profile
https://<your-domain>/login
https://<your-domain>/register
https://<your-domain>/dashboard/profile
```

Missing or mistyped entries produce **`redirect_uri_mismatch`**. Trailing
slashes and `http` vs `https` both matter. Changes take a few minutes to
propagate.

Source of truth for these paths:
- `src/pages/auth/Login.tsx` → `/login`
- `src/pages/auth/Register.tsx` → `/register`
- `src/utils/googleDrive.ts` → `/dashboard/profile`

## 4. Enable the API

**APIs & Services → Library → Google Drive API → Enable.** The app requests the
`drive.file` scope; Drive sync fails without this.

## 5. Consent screen

**APIs & Services → OAuth consent screen.**

While in **Testing**, only accounts on the *Test users* list can sign in, and
Google shows a **"Google hasn't verified this app"** interstitial. Refresh
tokens also expire every 7 days.

**Publishing removes both.** The only Drive scope used is `drive.file`, which
Google classifies **non-sensitive** — so publishing needs **no security review
or app verification**. You need a privacy policy URL and a terms URL; the app
serves both at `/privacy` and `/terms`.

> The consent screen's app name comes from the Google Cloud project, **not** the
> code. After the O-Zenith rebrand it may still read "Zenith" — rename it there.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | A path in step 3 is missing/mistyped |
| `access_blocked` / "not verified" | Consent screen in Testing and the account isn't a test user |
| Drive works then stops after ~1 hour | Normal: implicit tokens are short-lived. The UI offers **Resume session** |
| Keys/plan don't reach a second browser | The Drive mirror was never published — click **Sync now** on the browser that has them |

**Token lifetime is inherent to having no backend.** Implicit-flow tokens live
~1 hour and cannot be refreshed silently; that needs a server doing an
authorization-code exchange with a client secret.
