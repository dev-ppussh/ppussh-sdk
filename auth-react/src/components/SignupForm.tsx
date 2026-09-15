import { useState } from "react";
import { Mail, User, KeyRound, ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";

import { SocialButtons } from "./SocialButtons";
import { usePPUSSH } from "./PPUSSHProvider";
import type { SocialProvider } from "../api";

export interface SignupFormProps {
  loading: boolean;
  error: string | null;
  onSubmit: (input: { name: string; email: string; password: string }) => void;
  onSwitchToSignin?: () => void;
  hcaptchaSiteKey?: string;
  socialProviders?: SocialProvider[];
  onSocialSelect?: (provider: SocialProvider) => void;
}

export function SignupForm({ loading, error, onSubmit, onSwitchToSignin, hcaptchaSiteKey, socialProviders = ["google", "github"], onSocialSelect }: SignupFormProps): React.JSX.Element {
  const { config } = usePPUSSH();
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [captchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState("");

  const passwordRequirements = [
    { test: formData.password.length >= 8, message: "At least 8 characters" },
    { test: /[A-Z]/.test(formData.password), message: "At least one uppercase letter" },
    { test: /[a-z]/.test(formData.password), message: "At least one lowercase letter" },
    { test: /\d/.test(formData.password), message: "At least one number" },
  ];

  const validateStepOne = () => {
    const e = { ...errors, name: "", email: "" };
    if (!formData.name.trim()) e.name = "Full name is required";
    if (!formData.email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = "Email is invalid";
    setErrors(e);
    return !e.name && !e.email;
  };

  const validateStepTwo = () => {
    const e = { ...errors, password: "", confirmPassword: "" };
    const failed = passwordRequirements.find((r) => !r.test);
    if (failed) e.password = failed.message;
    if (!formData.confirmPassword) e.confirmPassword = "Please confirm your password";
    else if (formData.password !== formData.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return !e.password && !e.confirmPassword;
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStepOne()) return;
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setConsentError("");
    setCaptchaError("");
    if (!validateStepTwo()) return;
    if (!acceptedTerms) {
      setConsentError("You must accept the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (hcaptchaSiteKey && !captchaToken) {
      setCaptchaError("Please complete the CAPTCHA");
      return;
    }
    onSubmit({ name: formData.name.trim(), email: formData.email.trim(), password: formData.password });
  };

  if (step === 1) {
    return (
      <div className="pp-form-group">
        {onSocialSelect && (
          <>
            <div style={{ textAlign: "center" }} className="pp-form-group">
              <h2 className="pp-heading" style={{ fontSize: 28, lineHeight: "32px" }}>Create your PPUSSH Account</h2>
              <p className="pp-subheading" style={{ marginBottom: 0, fontSize: 14, lineHeight: "20px" }}>
                Start your journey today with a cleaner experience.
              </p>
            </div>
            <SocialButtons loading={loading} providers={socialProviders} onSelect={onSocialSelect} />
            <div className="pp-divider">
              <div className="pp-divider-line" />
              <span className="pp-divider-text">or</span>
              <div className="pp-divider-line" />
            </div>
          </>
        )}
        <form className="pp-form-group" onSubmit={handleContinue}>
          {error && <div className="pp-error">{error}</div>}
          <div className="pp-form-group">
            <label htmlFor="ppussh-signup-name" className="pp-label">Full Name</label>
            <div className="pp-input-wrap">
              <input
                id="ppussh-signup-name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="pp-input pp-input-with-icon"
              />
              <div className="pp-input-icon">
                <User />
              </div>
            </div>
            {errors.name && <p style={{ fontSize: 13, color: "#dc2626", marginLeft: 4 }}>{errors.name}</p>}
          </div>

          <div className="pp-form-group">
            <label htmlFor="ppussh-signup-email" className="pp-label">Email Address</label>
            <div className="pp-input-wrap">
              <input
                id="ppussh-signup-email"
                type="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="pp-input pp-input-with-icon"
              />
              <div className="pp-input-icon">
                <Mail />
              </div>
            </div>
            {errors.email && <p style={{ fontSize: 13, color: "#dc2626", marginLeft: 4 }}>{errors.email}</p>}
          </div>

          <button className="pp-btn pp-btn-primary" type="submit">
            <span>Continue</span>
            <ArrowRight style={{ width: 20, height: 20, transition: "transform 0.15s" }} />
          </button>

          {onSwitchToSignin && (
            <p style={{ textAlign: "center", fontSize: 14, color: "var(--pp-on-surface-variant)" }}>
              Already have an account?{" "}
              <button type="button" onClick={onSwitchToSignin} className="pp-link">
                Log in
              </button>
            </p>
          )}
        </form>
      </div>
    );
  }

  // Step 2: Security
  return (
    <form className="pp-form-group" onSubmit={handleSubmit}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 className="pp-heading">Create your Password</h2>
        <p className="pp-subheading" style={{ marginBottom: 0 }}>
          Choose a strong password to secure your account.
        </p>
      </div>

      {error && <div className="pp-error">{error}</div>}

      <div className="pp-form-group">
        <label htmlFor="ppussh-signup-password" className="pp-label">Password</label>
        <div className="pp-input-wrap">
          <input
            id="ppussh-signup-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
            className="pp-input pp-input-with-icon"
            style={{ paddingRight: 40, borderColor: errors.password ? "#dc2626" : undefined }}
          />
          <div className="pp-input-icon">
            <KeyRound />
          </div>
          <div className="pp-input-actions">
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="pp-input-action" tabIndex={-1}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>
        {errors.password && <p style={{ fontSize: 13, color: "#dc2626" }}>{errors.password}</p>}
        {formData.password.length > 0 && (
          <ul className="pp-password-checklist">
            {passwordRequirements.map((req) => (
              <li key={req.message} className="pp-password-check" data-met={req.test ? "true" : "false"}>
                <span className="pp-password-check-dot" />
                {req.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pp-form-group">
        <label htmlFor="ppussh-signup-confirm" className="pp-label">Confirm Password</label>
        <div className="pp-input-wrap">
          <input
            id="ppussh-signup-confirm"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChange={(e) => setFormData((p) => ({ ...p, confirmPassword: e.target.value }))}
            className="pp-input pp-input-with-icon"
            style={{ paddingRight: 40, borderColor: errors.confirmPassword ? "#dc2626" : undefined }}
          />
          <div className="pp-input-icon">
            <KeyRound />
          </div>
          <div className="pp-input-actions">
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="pp-input-action" tabIndex={-1}>
              {showConfirmPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>
        {errors.confirmPassword && <p style={{ fontSize: 13, color: "#dc2626" }}>{errors.confirmPassword}</p>}
      </div>

      {/* hCaptcha placeholder */}
      {hcaptchaSiteKey ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div data-hcaptcha-sitekey={hcaptchaSiteKey} className="h-captcha" />
          {captchaError && <p style={{ fontSize: 13, color: "#dc2626", textAlign: "center" }}>{captchaError}</p>}
        </div>
      ) : null}
      {!hcaptchaSiteKey && captchaError && <p style={{ fontSize: 13, color: "#dc2626", textAlign: "center" }}>{captchaError}</p>}

      <div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => { setAcceptedTerms(e.target.checked); if (consentError) setConsentError(""); }}
            style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "var(--pp-primary)" }}
          />
          <span style={{ fontSize: 12, lineHeight: "20px", color: "var(--pp-on-surface-variant)" }}>
            I agree to the{" "}
            <a href={`${config.accountsUrl}/terms`} target="_blank" rel="noreferrer" className="pp-link" style={{ fontSize: 12 }}>
              Terms of Service
            </a>{" "}
            and{" "}
            <a href={`${config.accountsUrl}/privacy`} target="_blank" rel="noreferrer" className="pp-link" style={{ fontSize: 12 }}>
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {consentError && <p style={{ marginTop: 6, fontSize: 12, color: "#dc2626" }}>{consentError}</p>}
      </div>

      <div className="pp-form-row-responsive">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={loading}
          aria-label="Back to identity step"
          className="pp-btn pp-btn-outline pp-btn-sm"
        >
          <ArrowLeft style={{ width: 20, height: 20 }} />
          <span>Back</span>
        </button>
        <button className="pp-btn pp-btn-primary" type="submit" disabled={loading || !acceptedTerms}>
          {loading ? (
            <>
              <span className="pp-spinner" />
              <span>Creating account…</span>
            </>
          ) : (
            <>
              <span>Create Account</span>
              <ArrowRight style={{ width: 20, height: 20 }} />
            </>
          )}
        </button>
      </div>

      {onSwitchToSignin && (
        <p style={{ marginTop: 32, textAlign: "center", fontSize: 14, color: "var(--pp-on-surface-variant)" }}>
          Already have an account?{" "}
          <button type="button" onClick={onSwitchToSignin} className="pp-link">
            Log in
          </button>
        </p>
      )}
    </form>
  );
}
