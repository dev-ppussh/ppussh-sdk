import { ArrowRight, AppWindow, Mail, User } from "lucide-react";
import type { ProductInfo } from "../api";

export interface ConsentScreenProps {
  product: ProductInfo;
  loading: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentScreen({ product, loading, error, onAccept, onDecline }: ConsentScreenProps): React.JSX.Element {
  return (
    <div className="pp-form-group">
      <div style={{ textAlign: "center" }}>
        <h2 className="pp-heading">Authorize Application</h2>
        <p className="pp-subheading" style={{ marginBottom: 0 }}>
          {product.product_name} is requesting permission to access your ppussh account.
        </p>
      </div>

      <div className="pp-consent-connection">
        <div className="pp-consent-line" />
        <div className="pp-consent-node">
          <AppWindow />
        </div>
        <div className="pp-consent-arrow">
          <ArrowRight />
        </div>
        <div className="pp-consent-node">
          <AppWindow />
        </div>
      </div>

      <hr className="pp-consent-separator" />

      <div className="pp-form-group">
        <h3 className="pp-consent-list-header">Requested Access</h3>
        <ul className="pp-consent-list">
          <li className="pp-consent-item">
            <Mail style={{ color: "var(--pp-primary)" }} />
            <div>
              <p className="pp-consent-item-title">View your email address</p>
              <p className="pp-consent-item-desc">Primary identifier for your account.</p>
            </div>
          </li>
          <li className="pp-consent-item">
            <User style={{ color: "var(--pp-outline)" }} />
            <p className="pp-consent-item-title" style={{ fontWeight: 400, color: "var(--pp-on-surface-variant)" }}>
              Access your basic profile information
            </p>
          </li>
          <li className="pp-consent-item">
            <AppWindow style={{ color: "var(--pp-outline)" }} />
            <p className="pp-consent-item-title" style={{ fontWeight: 400, color: "var(--pp-on-surface-variant)" }}>
              {product.product_base_url || "Manage your ppussh projects"}
            </p>
          </li>
        </ul>
      </div>

      {error && <div className="pp-error">{error}</div>}

      <div className="pp-form-group" style={{ marginTop: 8 }}>
        <button onClick={onAccept} disabled={loading} className="pp-btn pp-btn-primary">
          {loading ? (
            <>
              <span className="pp-spinner" />
              Authorizing...
            </>
          ) : (
            <>
              Authorize
              <ArrowRight style={{ width: 16, height: 16 }} />
            </>
          )}
        </button>
        <button onClick={onDecline} className="pp-btn pp-btn-outline">
          Cancel
        </button>
      </div>

      <div style={{ paddingTop: 16, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--pp-outline)" }}>
          You can revoke access at any time in your{" "}
          <a className="pp-link" href="#">
            ppussh settings
          </a>
          .
        </p>
      </div>
    </div>
  );
}
