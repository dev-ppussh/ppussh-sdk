# ppussh-react

Embeddable PPUSSH authentication (modal + embedded) for products.

**Accounts remains the source of truth.** This SDK is a UI/UX layer around the
existing Accounts authentication system — not a new auth system. It consumes
the existing JSON continuation contract (`POST /auth/authorize` →
`{redirect_url}`, `POST /auth/consent` → `{redirect_url}`) without navigating,
and the product backend exchanges the code via the unchanged
`POST /oauth/token`. Product and provider callback URLs are unchanged.

```text
Product UI → ppussh-react → Accounts API → {redirect_url} (?code=&state=…)
→ product BFF → POST /oauth/token → product session
```

## Install

```bash
npm install ppussh-react
```

Requires `react >= 18` (peer). Styles are fully self-contained (`pp-`-prefixed
CSS, injected automatically) — **no Tailwind (or any CSS framework) required in
the consuming app.**

## One-time setup in Accounts

1. **Register your product** in Accounts and note its `client_id`.
2. **Set the redirect URI** to your callback route, e.g.
   `https://product.com/auth/callback` — the SDK never alters it.
3. **Add your browser origin to `web_origins`** on the product (comma
   separated, e.g. `https://product.com, https://www.product.com`). This is
   what the gateway/API uses to grant scoped CORS to SDK requests
   (`X-PPUSSH-Client-ID`). Exact match; no wildcards.

## Quick start — modal (recommended)

```tsx
import { useState } from "react";
import { PPUSSHAuth, PPUSSHError } from "ppussh-react";

function ContinueWithPPUSSH() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Continue with PPUSSH</button>

      <PPUSSHAuth
        mode="modal"
        open={open}
        onOpenChange={setOpen}
        accountsUrl="https://accounts.ppussh.com"
        apiBaseUrl="https://accounts.ppussh.com" // gateway in production
        clientId="<product-client-id>"
        redirectUri="https://product.com/auth/callback"
        onComplete={async ({ code, state }) => {
          // Hand the code to YOUR backend — it exchanges via POST /oauth/token
          // exactly as in the full-page flow. The SDK never sees the secret.
          await fetch("/api/ppussh/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, state }),
          });
        }}
        onError={(err: PPUSSHError) => console.error(err.code, err.message)}
      />
    </>
  );
}
```

What the user sees, in order:

1. **Sign in** — email + password (Google/GitHub buttons if configured).
2. Already authorized for your product → `onComplete` fires with the code.
3. First sign-in → **consent screen** (product name/description) → Accept →
   code; Decline → `authorization_denied` error.
4. No account yet → **sign up** → "check your email" → verify → signed in.
5. "Forgot password?" → recovery email → reset link → back to sign-in.

The modal closes itself after success (`onOpenChange(false)`).

## Embedded login page

Same API, rendered inline instead of as an overlay:

```tsx
<PPUSSHAuth
  mode="embedded"
  accountsUrl="https://accounts.ppussh.com"
  clientId="<product-client-id>"
  redirectUri="https://product.com/auth/callback"
  onComplete={({ code, state }) => void exchangeOnYourBff(code, state)}
/>
```

`open` / `onOpenChange` are modal-only; embedded ignores them.

## Exchanging the code (your backend)

The SDK **never** holds `client_secret` and never exchanges tokens. Do it
server-side, same as the full-page flow:

```ts
// POST /api/ppussh/complete  (your BFF — keep state in a short-lived cookie)
const { code, state } = req.body;
if (state !== cookieState) return res.status(400).end();

const tokenRes = await fetch("https://accounts.ppussh.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code,
    redirect_uri: "https://product.com/auth/callback",
    client_id: process.env.PPUSSH_CLIENT_ID,
    client_secret: process.env.PPUSSH_CLIENT_SECRET, // server only!
  }),
});
// → create your own product session from the tokens
```

Generate and store `state` yourself before opening the SDK (or pass a fixed
one per transaction via the `state` prop) and verify it on completion.
For a complete production wiring — config bootstrap endpoint, the popup
callback page, and COOP-safe success detection — see
[Production recipe](#production-recipe-embedded--social-that-always-works)
below.

## Social login (popup)

Google/GitHub run in a popup — no redirect away from your page. Mount the
callback handler **once** on your existing callback route:

```tsx
import { PPUSSHCallbackHandler } from "ppussh-react";

// e.g. React Router
<Route
  path="/auth/callback"
  element={
    <>
      <PPUSSHCallbackHandler
        openerOrigin={window.location.origin}
        onDirectNavigation={({ code, state }) => completeLogin(code, state)}
      />
      {/* …existing callback UI… */}
    </>
  }
/>
```

- **Popup navigation** → handler posts `{code, state}` to the opener and
  closes; your `onComplete` path runs in the original page.
- **Direct navigation** (no opener) → `onDirectNavigation` fires so your
  normal callback logic can run.

For an even faster postMessage-before-close, your callback module can also
call `completePopupCallback(window.location.origin)` at top level before
React mounts (it is idempotent-safe: without an opener it returns
`"no-opener"` and does nothing).

## Production recipe: embedded + social that always works

A battle-tested wiring from a real product (useorvix). Use this when you want
social login to complete even if popup↔opener messaging fails.

### 1. Bootstrap the config from your backend

Never hardcode `clientId`/`redirectUri`/`state` on the frontend:

1. Login page calls `GET /api/auth/sdk-config`.
2. **Your backend** generates the OIDC state (we prefix embedded-flow states
   with `e_`), sets it as an **HttpOnly `oauth_state` cookie**, returns
   `{accountsUrl, apiBaseUrl, clientId, redirectUri, state}`.
3. **Framework gotcha (Next.js):** rewrites strip `Set-Cookie` from proxied
   responses — fetch backend-to-backend in a **Route Handler**
   (`app/api/auth/sdk-config/route.ts`) and re-attach `oauth_state` on the
   response with the right origin. Route Handlers take priority over rewrites.

The `e_` prefix is just a convention: at callback time your backend can tell
"embedded SDK flow — don't exchange the code, bounce it to the frontend
popup page" apart from the normal full-page `GET /callback` exchange.

### 2. Render the SDK with the server-issued state

```jsx
const [completing, setCompleting] = useState(false);

<PPUSSHAuth
  mode="embedded"
  state={sdkConfig.state}
  accountsUrl={sdkConfig.accountsUrl}
  apiBaseUrl={sdkConfig.apiBaseUrl}
  clientId={sdkConfig.clientId}
  redirectUri={sdkConfig.redirectUri}
  onComplete={async ({ code, state }) => {
    if (completing) return;          // guard against double-fire
    setCompleting(true);
    try {
      const redirectUrl = await completePpusshLogin(code, state); // POST /complete
      window.location.href = redirectUrl;
    } catch {
      setCompleting(false);
    }
  }}
  onError={() => {}} // see §5 — suppress false-positive popup errors
/>
```

### 3. Create a callback page (required for social login)

Your registered `redirectUri` should hit **your server first**, which decides
where the code goes:

1. **Server callback** (e.g. `GET /api/auth/callback`): validate as usual,
   but if `state` carries your embedded-flow prefix (`e_`), **do not exchange
   the code** — `302` the popup to the frontend callback page:
   `/auth/callback?code=…&state=e_…`.
2. **Frontend callback page** (`app/auth/callback/page.tsx`) runs *inside the
   popup*. On mount, in this order:

```tsx
useEffect(() => {
  // 1) Flag FIRST — before any await — so it survives even if the SDK/COOP
  //    closes the popup while the request is still in flight.
  localStorage.setItem("ppussh_popup_auth", "1");

  (async () => {
    // 2) Complete the login (same endpoint the modal uses — idempotent).
    await fetch("/api/auth/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    });
    // 3) Give the request a moment to settle, then close the popup.
    setTimeout(() => window.close(), 500);
  })();
}, []);
```

Your server's `POST /complete` does the real work: verify body `state` vs the
`oauth_state` cookie (same CSRF check as the full-page `/callback`), exchange
the code, upsert the user, mint your session cookies, return
`{redirectUrl}`. Because both paths (popup page **and** SDK `onComplete`) can
call it with the same code, make it **idempotent**.

### 4. Detect success on the login page (don't rely on the opener)

**COOP caveat:** providers like Google send `Cross-Origin-Opener-Policy`
headers that sever `window.opener` — the SDK's popup→opener `postMessage`
can't reach you, so `waitForPopupResult` may report a false
"Authentication was cancelled" *after the login actually succeeded*.

Make the localStorage flag the **primary** success signal, and SDK
`onComplete` the **backup**:

```jsx
useEffect(() => {
  let done = false;
  const interval = setInterval(() => {
    if (done || localStorage.getItem("ppussh_popup_auth") !== "1") return;
    localStorage.removeItem("ppussh_popup_auth");
    done = true;
    clearInterval(interval);
    setTimeout(() => {
      const next = resolveNext();      // read ?next=
      clearIntendedRoute();            // clear sessionStorage fallback
      window.location.href = isFullUrl(next) ? next : next || "/";
    }, 3000);                          // wait for the popup to close cleanly
  }, 200);
  return () => clearInterval(interval);
}, []);
```

The flag is written *before* the popup's `fetch`, so there is no race: worst
case the popup dies mid-request and the login page still sees the flag.

### 5. Optionally suppress false-positive SDK errors

When the popup path succeeds but opener messaging failed, the SDK may render
"Authentication was cancelled" (`popup_closed`) even though auth worked. If
your polling path owns success detection, hide it:

```css
.pp-error {
  display: none !important;
}
```

Trade-off: legitimate inline errors are hidden too — real failures leave the
user on the page where they can retry.

### 6. Preserve the `?next` destination end-to-end

1. Unauthenticated hit on `https://find.example.com/project-123` → your proxy
   encodes it: `/login?next=https%3A%2F%2Ffind.example.com%2Fproject-123`.
2. Login page reads it (`resolveNext()`); `RequireAuth` also stashes it in
   `sessionStorage` as a fallback for non-subdomain bounces.
3. After auth: clear the stash → `window.location.href = next`.

### Flow diagram (embedded + social)

```text
login page ──GET /sdk-config──► BFF (sets oauth_state cookie, state=e_…)
   │
   ▼
<PPUSSHAuth mode="embedded"> ──user clicks Google──► popup → Accounts → Google
   │                                                    │
   │                                                    ▼
   │                          server /callback sees e_ → 302 frontend /auth/callback
   │                                                    │
   │                       sets localStorage flag ──────┤ POST /complete (idempotent)
   │◄───── polls flag every 200ms ──────────────────────┘ window.close()
   ▼
redirect to ?next   (onComplete POST /complete runs in parallel as backup)
```

## Full-page fallback

If popups are blocked or the modal cannot complete:

```ts
import { buildLoginUrl, redirectToAccounts } from "ppussh-react";

// navigate the main window:
redirectToAccounts("https://accounts.ppussh.com", {
  clientId,
  redirectUri,
  state,
  scope,     // optional
  display: "popup", // optional presentation hint
});

// or just build the URL:
const url = buildLoginUrl(accountsUrl, { clientId, redirectUri, state });
```

Same `/login` URL, same callback, same BFF exchange as before the SDK.

## `<PPUSSHAuth>` props

| Prop | Required | Description |
| ---- | -------- | ----------- |
| `accountsUrl` | yes | Origin of the Accounts frontend (popups, login URLs). |
| `apiBaseUrl` | no | Base URL for Accounts JSON APIs (gateway). Defaults to `accountsUrl`. |
| `clientId` | yes | Product client ID issued by Accounts. |
| `redirectUri` | yes | Registered product callback URL. Never altered. |
| `onComplete` | yes | `({ code, state }) => void` — send the code to your BFF. |
| `mode` | no | `"modal"` (default) or `"embedded"`. |
| `open` | modal | Controlled visibility. |
| `onOpenChange` | modal | Visibility setter; called with `false` on success/close. |
| `onError` | no | `(PPUSSHError) => void` — also shown inline in the UI. |
| `socialProviders` | no | e.g. `["google", "github"]` (defaults to both). |
| `state` | no | OIDC state. Generated per mount when omitted. |
| `scope` | no | Scope passthrough for full-page fallback. |

## Styling

- Self-contained `pp-` prefixed classes with `!important` on visual props —
  zero conflicts with your app's CSS; no Tailwind needed.
- Styles inject automatically (`<style id="ppussh-react-css">`). Raw CSS is
  exported as `CSS_TEXT` if you want to bundle it yourself.
- Inputs show icons; links are plain blue; no hover effects (by design).

## Lower-level API (headless)

Everything the modal uses is exported for custom UIs:

| Export | Purpose |
| ------ | ------- |
| `authorizeSignin` / `authorizeSignup` | `POST /auth/authorize` (signin/signup) |
| `grantConsent` | `POST /auth/consent` |
| `socialAuthorize` | Start provider OAuth, returns provider URL |
| `verifyEmailToken` / `resendVerification` | Email verification helpers |
| `forgotPassword` / `resetPassword` | Recovery helpers |
| `getProductInfo` | `GET /public/products/by-client-id/{id}` (consent screen) |
| `parseAuthResult` | `{redirect_url}` → `{code, state}` |
| `buildLoginUrl` / `redirectToAccounts` | Full-page fallback |
| `openAuthPopup` / `waitForPopupResult` / `completePopupCallback` | Popup plumbing |
| `PPUSSHProvider` / `usePPUSSH` | Config + state context for custom flows |
| `EmailSignIn`, `SignupForm`, `ConsentScreen`, `SocialButtons`, `NoticeCard` | Individual UI pieces |
| `PPUSSHError` | `error.code` ∈ `network_error`, `invalid_credentials`, `popup_blocked`, `popup_closed`, `social_failed`, `state_mismatch`, `timeout`, … |

`resendVerification`, `forgotPassword`, and `resetPassword` accept an optional
`clientId` — pass it so the API gets the `X-PPUSSH-Client-ID` header for
scoped CORS.

## Backend requirements

1. **CORS / `web_origins`:** register your product origin in `web_origins`
   (see setup above). This drives dynamic CORS for SDK calls. The old static
   `CORS_ORIGINS` list still applies to non-SDK origins.
2. **Cookies:** `POST /auth/authorize` issues the session cookies with
   `SameSite=None; Secure` on https origins so the follow-up
   `POST /auth/consent` carries the session cross-origin. All other
   session-cookie flows keep `SameSite=Lax`. Plain-http dev origins keep
   `Lax` (localhost ports are same-site).
3. **State:** verify `state` on completion — the SDK does not do this for you
   on the BFF side.
4. **Fallback:** if popups are blocked or the modal cannot complete, use
   `buildLoginUrl()` / `redirectToAccounts()`.

## Trust boundary

```text
Product → ppussh-react → Accounts API → redirect_url (?code=&state=…)
→ product callback → product BFF → POST /oauth/token → product session
```

The SDK never holds `client_secret`, never exchanges tokens, never stores
sessions, and never reimplements authorization. Consent UI is presentation
only; the grant happens server-side via `POST /auth/consent`.

## Fixture

`examples/frontend_test` renders a modal card alongside the legacy
full-page link, backed by `GET /api/sdk-config` + `POST /api/complete` in
`examples/backend_test/app.py` — same code exchange, same state-cookie
check, same session cookie as `GET /callback`.

## Roadmap

1. ✅ Foundation + modal email sign-in + consent + callback handler
2. ✅ Social popup infra (`socialAuthorize`, `openAuthPopup`,
   `waitForPopupResult`, `SocialButtons`, wired for Google + GitHub)
3. ✅ Signup + email verification + resend states
4. ✅ Forgot-password entry + `resetPassword`/`verifyEmailToken` helpers
5. ✅ Full-page fallback (`redirectToAccounts`, `buildLoginUrl`)
6. ✅ Scoped CORS (`X-PPUSSH-Client-ID` + `web_origins`) and
   `popup.closed` grace period
7. `?display=popup` minimal Accounts chrome (presentation-only, optional)
8. RBA/device flows — intentionally out of scope: RBA challenges exist only
   on the native Accounts login path (`POST /auth/login`), never on the
   product `POST /auth/authorize` path the SDK uses (verified against
   `accounts-api/app/api/auth.py`)
