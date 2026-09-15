import { useState, type FormEvent } from "react";
import { Mail, KeyRound, Eye, EyeOff } from "lucide-react";

export interface EmailSignInProps {
  loading: boolean;
  error: string | null;
  onSubmit: (credentials: { email: string; password: string }) => void;
  onForgotPassword?: () => void;
}

export function EmailSignIn({ loading, error, onSubmit, onForgotPassword }: EmailSignInProps): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });

  function validate(): boolean {
    const e: typeof errors = { email: "", password: "" };
    if (!email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Email is invalid";
    if (!password) e.password = "Password is required";
    setErrors(e);
    return !e.email && !e.password;
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({ email: email.trim(), password });
  }

  return (
    <form className="pp-form-group" onSubmit={handleSubmit}>
      {/* Email */}
      <div className="pp-form-group">
        <label htmlFor="ppussh-email" className="pp-label">
          Email address
        </label>
        <div className="pp-input-wrap">
          <input
            id="ppussh-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="pp-input pp-input-with-icon"
          />
          <div className="pp-input-icon">
            <Mail />
          </div>
        </div>
        {errors.email && <p style={{ fontSize: 13, color: "#dc2626", marginLeft: 4 }}>{errors.email}</p>}
      </div>

      {/* Password */}
      <div className="pp-form-group">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginLeft: 4 }}>
          <label htmlFor="ppussh-password" className="pp-label" style={{ marginBottom: 0 }}>
            Password
          </label>
          {onForgotPassword && (
            <button type="button" onClick={onForgotPassword} className="pp-forgot-link">
              Forgot password?
            </button>
          )}
        </div>
        <div className="pp-input-wrap">
          <input
            id="ppussh-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="pp-input pp-input-with-icon"
            style={{ paddingRight: 40 }}
          />
          <div className="pp-input-icon">
            <KeyRound />
          </div>
          <div className="pp-input-actions">
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="pp-input-action"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>
        {errors.password && <p style={{ fontSize: 13, color: "#dc2626" }}>{errors.password}</p>}
      </div>

      {error && <div className="pp-error">{error}</div>}

      <button className="pp-btn pp-btn-primary" type="submit" disabled={loading}>
        {loading ? (
          <>
            <span className="pp-spinner" />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>
    </form>
  );
}
