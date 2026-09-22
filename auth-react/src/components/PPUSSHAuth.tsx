import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail } from "lucide-react";
import {
  authorizeSignin,
  authorizeSignup,
  forgotPassword,
  grantConsent,
  resendVerification,
  socialAuthorize,
  type ProductInfo,
  type SocialProvider,
} from "../api";
import { PPUSSHError } from "../errors";
import { PPUSSHProvider, usePPUSSH } from "./PPUSSHProvider";
import { EmailSignIn } from "./EmailSignIn";
import { SignupForm } from "./SignupForm";
import { NoticeCard } from "./NoticeCard";
import { ConsentScreen } from "./ConsentScreen";
import { SocialButtons } from "./SocialButtons";
import { waitForPopupResult } from "../popup";
import type { PPUSSHAuthConfig } from "../config";
import { CSS_TEXT } from "../css";

export interface AuthCompleteResult {
  code: string;
  state: string;
}

export interface PPUSSHAuthProps extends PPUSSHAuthConfig {
  mode?: "modal" | "embedded";
  state?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  socialProviders?: SocialProvider[];
  onComplete: (result: AuthCompleteResult) => void;
  onError?: (error: PPUSSHError) => void;
}

type View = "signin" | "signup" | "verify-sent" | "forgot" | "forgot-sent" | "consent";

function InjectStyles(): null {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("ppussh-react-css")) return;
    const style = document.createElement("style");
    style.id = "ppussh-react-css";
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
  }, []);
  return null;
}

function AuthFlow({
  mode,
  socialProviders,
  onComplete,
  onError,
  onClose,
}: {
  mode: "modal" | "embedded";
  socialProviders: SocialProvider[];
  onComplete: (result: AuthCompleteResult) => void;
  onError?: (error: PPUSSHError) => void;
  onClose: () => void;
}): React.JSX.Element {
  InjectStyles();
  const { config, state } = usePPUSSH();
  const [view, setView] = useState<View>("signin");
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [forgotEmail, setForgotEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(err: unknown): void {
    const ppusshError = err instanceof PPUSSHError ? err : new PPUSSHError("unknown", "Sign-in failed");
    setError(ppusshError.message);
    setLoading(false);
    onError?.(ppusshError);
  }

  async function handleSignin(credentials: { email: string; password: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await authorizeSignin(config.apiBaseUrl, {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
        email: credentials.email,
        password: credentials.password,
      });
      if (result.status === "authorized") {
        setLoading(false);
        onComplete({ code: result.code, state: result.state });
        onClose();
        return;
      }
      setProduct(result.product);
      setView("consent");
      setLoading(false);
    } catch (err) {
      fail(err);
    }
  }

  async function handleAccept(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await grantConsent(config.apiBaseUrl, {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      });
      setLoading(false);
      onComplete({ code: result.code, state: result.state });
      onClose();
    } catch (err) {
      fail(err);
    }
  }

  async function handleSignup(input: { name: string; email: string; password: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await authorizeSignup(config.apiBaseUrl, {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
        name: input.name,
        email: input.email,
        password: input.password,
      });
      void result;
      setPendingEmail(input.email);
      setView("verify-sent");
      setLoading(false);
    } catch (err) {
      fail(err);
    }
  }

  async function handleResend(): Promise<void> {
    if (!pendingEmail) return;
    setLoading(true);
    setError(null);
    try {
      await resendVerification(config.apiBaseUrl, pendingEmail, config.clientId);
      setLoading(false);
    } catch (err) {
      fail(err);
    }
  }

  async function handleForgot(email: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(config.apiBaseUrl, email, config.clientId);
      setView("forgot-sent");
      setLoading(false);
    } catch (err) {
      fail(err);
    }
  }

  async function handleSocial(provider: SocialProvider): Promise<void> {
    setLoading(true);
    setError(null);
    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", `ppussh-auth-${provider}`, "width=520,height=680,menubar=no,toolbar=no,location=yes");
      if (!popup || popup.closed) popup = null;
    } catch {
      popup = null;
    }
    if (popup) {
      try {
        popup.document.write("<p style='font-family:sans-serif;padding:24px;color:#475569'>Loading…</p>");
      } catch {
        // cross-origin blank — ignore
      }
    }
    try {
      const providerUrl = await socialAuthorize(config.apiBaseUrl, {
        provider,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      });
      if (popup && !popup.closed) {
        popup.location.href = providerUrl;
        try { popup.focus(); } catch { /* ignore */ }
        const result = await waitForPopupResult(popup, {
          expectedOrigin: window.location.origin,
          expectedState: state,
        });
        setLoading(false);
        onComplete({ code: result.code, state: result.state });
        onClose();
        return;
      }
      window.location.href = providerUrl;
    } catch (err) {
      if (popup && !popup.closed) {
        try { popup.close(); } catch { /* ignore */ }
      }
      fail(err);
    }
  }

  function handleDecline(): void {
    const err = new PPUSSHError("authorization_denied", "Authorization was declined");
    setError(err.message);
    onError?.(err);
  }

  function switchView(next: View): void {
    setError(null);
    setView(next);
  }

  let body: React.JSX.Element;
  if (view === "consent" && product) {
    body = (
      <ConsentScreen product={product} loading={loading} error={error} onAccept={handleAccept} onDecline={handleDecline} />
    );
  } else if (view === "signup") {
    body = (
      <SignupForm
        loading={loading}
        error={error}
        onSubmit={handleSignup}
        onSwitchToSignin={() => switchView("signin")}
        socialProviders={socialProviders}
        onSocialSelect={handleSocial}
      />
    );
  } else if (view === "verify-sent") {
    body = (
      <NoticeCard
        title="Check your email"
        message={`We sent a verification link to ${pendingEmail ?? "your email"}. Open it to verify your account, then sign in here.`}
        actionLabel={loading ? "Sending…" : "Resend email"}
        onAction={loading ? undefined : handleResend}
      />
    );
  } else if (view === "forgot") {
    body = (
      <form
        className="pp-form-group"
        onSubmit={(event) => {
          event.preventDefault();
          void handleForgot(forgotEmail.trim());
        }}
      >
        <div className="pp-form-group">
          <label htmlFor="ppussh-forgot-email" className="pp-label">Email</label>
          <div className="pp-input-wrap">
            <input
              id="ppussh-forgot-email"
              type="email"
              required
              placeholder="you@example.com"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              disabled={loading}
              className="pp-input pp-input-with-icon"
            />
            <div className="pp-input-icon">
              <Mail />
            </div>
          </div>
        </div>
        {error && <div className="pp-error">{error}</div>}
        <button type="submit" disabled={loading} className="pp-btn pp-btn-primary">
          {loading ? "Sending…" : "Send recovery link"}
        </button>
        <button
          type="button"
          onClick={() => switchView("signin")}
          className="pp-btn pp-btn-outline"
        >
          Back to sign in
        </button>
      </form>
    );
  } else if (view === "forgot-sent") {
    body = (
      <NoticeCard
        title="Recovery email sent"
        message="If an account exists for that email, a recovery link is on its way. The link opens on the Accounts site."
        actionLabel="Back to sign in"
        onAction={() => switchView("signin")}
      />
    );
  } else {
    body = (
      <div className="pp-form-group">
        <SocialButtons loading={loading} providers={socialProviders} onSelect={handleSocial} />
        <div className="pp-divider">
          <div className="pp-divider-line" />
          <span className="pp-divider-text">or</span>
          <div className="pp-divider-line" />
        </div>
        <EmailSignIn loading={loading} error={error} onSubmit={handleSignin} onForgotPassword={() => switchView("forgot")} />
        <p style={{ textAlign: "center", fontSize: 14, color: "var(--pp-on-surface-variant)", marginTop: 8 }}>
          Don&apos;t have an account?{" "}
          <button type="button" onClick={() => switchView("signup")} className="pp-link">
            Sign up
          </button>
        </p>
      </div>
    );
  }

  const footer = (
    <>
      <div className="pp-footer">
        <a href={`${config.accountsUrl}/privacy`} target="_blank" rel="noreferrer">Privacy Policy</a>
        <a href={`${config.accountsUrl}/terms`} target="_blank" rel="noreferrer">Terms of Service</a>
      </div>
      <p className="pp-powered">
        Powered by <strong>ppussh accounts</strong>
      </p>
    </>
  );

  if (mode === "embedded") {
    return (
      <div className="pp-root pp-embedded">
        <div className="pp-card">
          <div className="pp-logo">
            <div className="pp-logo-text">ppussh</div>
          </div>
          {body}
          {footer}
        </div>
      </div>
    );
  }

  const modal = (
    <div className="pp-root pp-overlay" role="dialog" aria-modal="true" aria-label="Sign in with PPUSSH" onClick={onClose}>
      <div className="pp-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="pp-close">
          <X />
        </button>
        <div className="pp-logo">
          <div className="pp-logo-text">ppussh</div>
        </div>
        {body}
        {footer}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

export function PPUSSHAuth(props: PPUSSHAuthProps): React.JSX.Element | null {
  const {
    mode = "modal",
    state,
    open,
    onOpenChange,
    socialProviders = ["google", "github"],
    onComplete,
    onError,
    ...config
  } = props;
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = open ?? internalOpen;

  function handleClose(): void {
    if (onOpenChange) {
      onOpenChange(false);
    } else {
      setInternalOpen(false);
    }
  }

  if (mode === "modal" && !isOpen) {
    return null;
  }

  return (
    <PPUSSHProvider config={config} state={state}>
      <AuthFlow mode={mode} socialProviders={socialProviders} onComplete={onComplete} onError={onError} onClose={handleClose} />
    </PPUSSHProvider>
  );
}
