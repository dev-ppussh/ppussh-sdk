# ppussh-react

Embeddable PPUSSH authentication (modal + embedded) for products.

**Accounts remains the source of truth.** This SDK is a UI/UX layer around the
existing Accounts authentication system — not a new auth system. It consumes
the existing JSON continuation contract (`POST /auth/authorize` →
`{redirect_url}`, `POST /auth/consent` → `{redirect_url}`) without navigating,
and the product backend exchanges the code via the unchanged
`POST /oauth/token`. Product and provider callback URLs are unchanged.

## Install

```bash
npm install ppussh-react
```

Requires `react >= 18` (peer).

## Quick start — modal (Milestone 1)

```tsx
import { PPUSSHAuth } from "ppussh-react";

function CheckoutButton() {
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
        onError={(err) => console.error(err.code, err.message)}
      />
    </>
  );
}
```

Flow: email sign-in → already authorized ⇒ code; not authorized ⇒ SDK
consent screen ⇒ accept ⇒ code; decline ⇒ `authorization_denied`.

## Embedded login page

```tsx
<PPUSSHAuth mode="embedded" /* …same config… */ onComplete={…} />
```

## Social popup (Milestone 2) — callback handler

Mount on the product's **existing** callback route. Inside a popup it forwards
the code to the opener and closes; on direct navigation it delegates to the
product's standard logic:

```tsx
import { PPUSSHCallbackHandler } from "ppussh-react";

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

## Configuration

| Field         | Required | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `accountsUrl` | yes      | Origin of the Accounts frontend (popups, login URLs).    |
| `apiBaseUrl`  | no       | Base URL for Accounts JSON APIs (gateway). Defaults to `accountsUrl`. |
| `clientId`    | yes      | Product client ID issued by Accounts.                    |
| `redirectUri` | yes      | Registered product callback URL. Never altered.          |
| `state`       | no       | OIDC state. Generated per mount when omitted.            |
| `scope`       | no       | Optional scope passthrough.                              |

## Backend requirements

1. **CORS:** the product origin must be listed in the Accounts API
   `CORS_ORIGINS` (explicit origins — never wildcarded; `allow_credentials`
   is already enabled server-side).
2. **Cookies:** `POST /auth/authorize` issues the session cookies with
   `SameSite=None; Secure` on https origins so the follow-up
   `POST /auth/consent` carries the session cross-origin. All other
   session-cookie flows keep `SameSite=Lax`. Plain-http dev origins keep
   `Lax` (localhost ports are same-site).
3. **Fallback:** if popups are blocked or the modal cannot complete, send the
   user to the full-page Accounts flow via `buildLoginUrl()` (exported).

## Trust boundary

```text
Product → ppussh-react → Accounts API → redirect_url (?code=&state=…)
→ product callback → product BFF → POST /oauth/token → product session
```

The SDK never holds `client_secret`, never exchanges tokens, never stores
sessions, and never reimplements authorization. Consent UI is presentation
only; the grant happens server-side via `POST /auth/consent`.

## Roadmap

1. ✅ Foundation + modal email sign-in + consent + callback handler
2. ✅ Social popup infra (`socialAuthorize`, `openAuthPopup`,
   `waitForPopupResult`, `SocialButtons`, wired for Google + GitHub)
3. ✅ Signup + email verification + resend states
4. ✅ Forgot-password entry + `resetPassword`/`verifyEmailToken` helpers
5. ✅ Full-page fallback (`redirectToAccounts`, `buildLoginUrl`)
6. `?display=popup` minimal Accounts chrome (presentation-only, optional)
7. RBA/device flows — intentionally out of scope: RBA challenges exist only
   on the native Accounts login path (`POST /auth/login`), never on the
   product `POST /auth/authorize` path the SDK uses (verified against
   `accounts-api/app/api/auth.py`)

## Fixture

`examples/frontend_test` renders a modal card alongside the legacy
full-page link, backed by `GET /api/sdk-config` + `POST /api/complete` in
`examples/backend_test/app.py` — same code exchange, same state-cookie
check, same session cookie as `GET /callback`.
