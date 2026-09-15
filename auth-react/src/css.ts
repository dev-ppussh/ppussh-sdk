export const CSS_TEXT = `
/* ────────────────────────────────────────────────────────────────────────────
   ppussh-react — Self-contained design system
   All classes prefixed with "pp-". No Tailwind needed.
   !important only on properties hostile CSS typically overrides.
   ──────────────────────────────────────────────────────────────────────────── */

:root {
  --pp-primary: #004ac6;
  --pp-primary-hover: #003da3;
  --pp-primary-container: #2563eb;
  --pp-on-primary: #ffffff;
  --pp-on-surface: #0b1c30;
  --pp-on-surface-variant: #434655;
  --pp-surface: #f8f9ff;
  --pp-surface-bright: #f8f9ff;
  --pp-surface-container: #e5eeff;
  --pp-surface-container-low: #eff4ff;
  --pp-surface-container-lowest: #ffffff;
  --pp-surface-container-high: #dce9ff;
  --pp-surface-container-highest: #d3e4fe;
  --pp-outline: #737686;
  --pp-outline-variant: #c3c6d7;
  --pp-error: #ba1a1a;
  --pp-ring: #004ac6;
  --pp-radius: 8px;
  --pp-radius-sm: 4px;
  --pp-font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

@keyframes pp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pp-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes pp-spin {
  to { transform: rotate(360deg); }
}

/* ── Base ─────────────────────────────────────────────────────────────────── */
.pp-root {
  font-family: var(--pp-font) !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  color: var(--pp-on-surface) !important;
  -webkit-font-smoothing: antialiased !important;
}

/* ── Overlay ─────────────────────────────────────────────────────────────── */
.pp-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 50 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(0, 0, 0, 0.25) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  padding: 16px !important;
}

/* ── Modal Card ──────────────────────────────────────────────────────────── */
.pp-card {
  position: relative !important;
  width: 100% !important;
  max-width: 448px !important;
  max-height: 90vh !important;
  overflow-y: auto !important;
  background: var(--pp-surface-container-lowest) !important;
  border: 1px solid rgba(195, 198, 215, 0.3) !important;
  border-radius: var(--pp-radius) !important;
  padding: 24px !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06), 0 10px 15px -3px rgba(0,0,0,0.05) !important;
  animation: pp-scale-in 0.15s ease-out !important;
}

.pp-card::-webkit-scrollbar { width: 6px !important; }
.pp-card::-webkit-scrollbar-track { background: transparent !important; }
.pp-card::-webkit-scrollbar-thumb { background: var(--pp-outline-variant) !important; border-radius: 3px !important; }

/* ── Embedded ────────────────────────────────────────────────────────────── */
.pp-embedded {
  width: 100% !important;
  max-width: 448px !important;
}

.pp-embedded .pp-card {
  max-height: none !important;
  animation: none !important;
}

/* ── Close Button ────────────────────────────────────────────────────────── */
.pp-close {
  position: absolute !important;
  right: 12px !important;
  top: 12px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 32px !important;
  height: 32px !important;
  border: none !important;
  border-radius: 50% !important;
  background: transparent !important;
  color: var(--pp-on-surface-variant) !important;
  cursor: pointer !important;
  z-index: 10 !important;
}

.pp-close svg {
  width: 16px !important;
  height: 16px !important;
}

/* ── Logo ─────────────────────────────────────────────────────────────────── */
.pp-logo {
  text-align: center !important;
  margin-bottom: 32px !important;
}

.pp-logo-text {
  font-size: 32px !important;
  line-height: 40px !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  color: var(--pp-primary) !important;
  font-family: var(--pp-font) !important;
}

/* ── Typography ──────────────────────────────────────────────────────────── */
.pp-heading {
  font-size: 24px !important;
  line-height: 32px !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: var(--pp-on-surface) !important;
  margin-bottom: 4px !important;
}

.pp-subheading {
  font-size: 14px !important;
  line-height: 20px !important;
  color: var(--pp-on-surface-variant) !important;
  margin-bottom: 24px !important;
}

.pp-label {
  display: block !important;
  font-size: 12px !important;
  line-height: 16px !important;
  font-weight: 500 !important;
  letter-spacing: 0.05em !important;
  color: var(--pp-on-surface) !important;
  margin-bottom: 4px !important;
  font-family: var(--pp-font) !important;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.pp-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  width: 100% !important;
  height: 40px !important;
  padding: 0 16px !important;
  border-radius: var(--pp-radius-sm) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  line-height: 20px !important;
  cursor: pointer !important;
  border: 1px solid transparent !important;
  outline: none !important;
  white-space: nowrap !important;
  background: none !important;
  color: var(--pp-on-surface) !important;
  text-decoration: none !important;
  text-align: center !important;
}

.pp-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--pp-surface-container-lowest), 0 0 0 4px var(--pp-ring) !important;
}

.pp-btn:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

.pp-btn-primary {
  background: var(--pp-primary) !important;
  color: var(--pp-on-primary) !important;
  border-color: transparent !important;
}

.pp-btn-outline {
  background: transparent !important;
  color: var(--pp-on-surface) !important;
  border-color: var(--pp-outline-variant) !important;
}

.pp-btn-ghost {
  background: transparent !important;
  color: var(--pp-on-surface-variant) !important;
  border-color: transparent !important;
}

.pp-btn-sm {
  height: 36px !important;
  font-size: 13px !important;
  padding: 0 12px !important;
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */
.pp-input-wrap {
  position: relative !important;
}

.pp-input {
  display: block !important;
  width: 100% !important;
  height: 40px !important;
  padding: 0 12px !important;
  border-radius: var(--pp-radius-sm) !important;
  border: 1px solid var(--pp-outline-variant) !important;
  background: var(--pp-surface-container-lowest) !important;
  color: var(--pp-on-surface) !important;
  font-size: 14px !important;
  line-height: 20px !important;
  outline: none !important;
}

.pp-input::placeholder {
  color: var(--pp-outline) !important;
}

.pp-input:focus {
  border-color: var(--pp-primary) !important;
  box-shadow: 0 0 0 1px var(--pp-primary) !important;
}

.pp-input-with-icon {
  padding-left: 44px !important;
}

.pp-input-icon {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  height: 40px !important;
  width: 44px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
  color: var(--pp-on-surface-variant) !important;
}

.pp-input:focus ~ .pp-input-icon,
.pp-input-wrap:focus-within .pp-input-icon {
  color: var(--pp-primary) !important;
}

.pp-input-icon svg {
  width: 20px !important;
  height: 20px !important;
}

.pp-input-actions {
  position: absolute !important;
  right: 0 !important;
  top: 0 !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  padding-right: 8px !important;
  gap: 2px !important;
}

.pp-input-action {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  border-radius: 4px !important;
  background: transparent !important;
  color: var(--pp-on-surface-variant) !important;
  cursor: pointer !important;
}

.pp-input-action svg {
  width: 16px !important;
  height: 16px !important;
}

/* ── Textarea ────────────────────────────────────────────────────────────── */
.pp-textarea {
  display: block !important;
  width: 100% !important;
  min-height: 80px !important;
  padding: 10px 12px !important;
  border-radius: var(--pp-radius-sm) !important;
  border: 1px solid var(--pp-outline-variant) !important;
  background: var(--pp-surface-container-lowest) !important;
  color: var(--pp-on-surface) !important;
  font-size: 14px !important;
  line-height: 20px !important;
  outline: none !important;
  resize: vertical !important;
}

.pp-textarea::placeholder {
  color: var(--pp-outline) !important;
}

.pp-textarea:focus {
  border-color: var(--pp-primary) !important;
  box-shadow: 0 0 0 1px var(--pp-primary) !important;
}

/* ── Divider ─────────────────────────────────────────────────────────────── */
.pp-divider {
  display: flex !important;
  align-items: center !important;
  gap: 16px !important;
  margin: 24px 0 !important;
}

.pp-divider-line {
  flex: 1 !important;
  height: 1px !important;
  background: var(--pp-outline-variant) !important;
}

.pp-divider-text {
  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0.05em !important;
  text-transform: uppercase !important;
  color: var(--pp-on-surface-variant) !important;
}

/* ── Social Button ───────────────────────────────────────────────────────── */
.pp-social-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  width: 100% !important;
  height: 44px !important;
  padding: 0 16px !important;
  border-radius: var(--pp-radius-sm) !important;
  border: 1px solid var(--pp-outline-variant) !important;
  background: var(--pp-surface-container-lowest) !important;
  color: var(--pp-on-surface) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  text-decoration: none !important;
  text-align: center !important;
}

.pp-social-btn:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

.pp-social-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--pp-surface-container-lowest), 0 0 0 4px var(--pp-ring) !important;
}

.pp-social-btn svg {
  width: 20px !important;
  height: 20px !important;
  flex-shrink: 0 !important;
}

/* ── Error Alert ─────────────────────────────────────────────────────────── */
.pp-error {
  border-radius: var(--pp-radius-sm) !important;
  background: #fef2f2 !important;
  border: 1px solid rgba(220, 38, 38, 0.2) !important;
  padding: 12px 16px !important;
  font-size: 14px !important;
  color: #dc2626 !important;
  line-height: 20px !important;
}

/* ── Notice / Check-Email Card ───────────────────────────────────────────── */
.pp-notice {
  text-align: center !important;
}

.pp-notice-icon {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 64px !important;
  height: 64px !important;
  border-radius: 50% !important;
  background: var(--pp-surface-container) !important;
  margin: 0 auto 16px !important;
}

.pp-notice-icon svg {
  width: 32px !important;
  height: 32px !important;
  color: var(--pp-primary) !important;
}

.pp-notice-title {
  font-size: 20px !important;
  line-height: 28px !important;
  font-weight: 700 !important;
  color: var(--pp-on-surface) !important;
  margin-bottom: 8px !important;
}

.pp-notice-message {
  font-size: 14px !important;
  line-height: 20px !important;
  color: var(--pp-on-surface-variant) !important;
  margin-bottom: 24px !important;
}

.pp-notice-highlight {
  font-weight: 600 !important;
  color: var(--pp-on-surface) !important;
}

/* ── Consent ─────────────────────────────────────────────────────────────── */
.pp-consent-connection {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 16px !important;
  padding: 16px 0 !important;
  position: relative !important;
}

.pp-consent-line {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  width: 128px !important;
  height: 1px !important;
  background: var(--pp-outline-variant) !important;
  z-index: 0 !important;
}

.pp-consent-node {
  position: relative !important;
  z-index: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 64px !important;
  height: 64px !important;
  border-radius: var(--pp-radius) !important;
  border: 1px solid rgba(195, 198, 215, 0.5) !important;
  background: var(--pp-surface-container) !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
}

.pp-consent-node svg {
  width: 28px !important;
  height: 28px !important;
  color: var(--pp-primary) !important;
}

.pp-consent-arrow {
  position: relative !important;
  z-index: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  border: 1px solid var(--pp-outline-variant) !important;
  background: var(--pp-surface-container-lowest) !important;
  color: var(--pp-outline) !important;
}

.pp-consent-arrow svg {
  width: 14px !important;
  height: 14px !important;
}

.pp-consent-separator {
  width: 100% !important;
  border: none !important;
  border-top: 1px solid rgba(195, 198, 215, 0.5) !important;
  margin: 0 !important;
}

.pp-consent-list-header {
  font-size: 12px !important;
  line-height: 16px !important;
  font-weight: 500 !important;
  letter-spacing: 0.05em !important;
  text-transform: uppercase !important;
  color: var(--pp-on-surface) !important;
  font-family: var(--pp-font) !important;
}

.pp-consent-list {
  list-style: none !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

.pp-consent-item {
  display: flex !important;
  align-items: flex-start !important;
  gap: 16px !important;
  padding: 8px 0 !important;
}

.pp-consent-item svg {
  width: 20px !important;
  height: 20px !important;
  flex-shrink: 0 !important;
  margin-top: 2px !important;
}

.pp-consent-item-title {
  font-size: 14px !important;
  line-height: 20px !important;
  font-weight: 500 !important;
  color: var(--pp-on-surface) !important;
}

.pp-consent-item-desc {
  font-size: 13px !important;
  line-height: 18px !important;
  color: var(--pp-on-surface-variant) !important;
  margin-top: 2px !important;
}

/* ── Password Strength ───────────────────────────────────────────────────── */
.pp-password-checklist {
  list-style: none !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  margin-top: 6px !important;
}

.pp-password-check {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 12px !important;
  color: var(--pp-outline) !important;
}

.pp-password-check[data-met="true"] {
  color: #059669 !important;
}

.pp-password-check-dot {
  width: 5px !important;
  height: 5px !important;
  border-radius: 50% !important;
  background: currentColor !important;
  flex-shrink: 0 !important;
}

/* ── Form Layout ─────────────────────────────────────────────────────────── */
.pp-form-group {
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
}

.pp-form-row {
  display: flex !important;
  gap: 12px !important;
  align-items: center !important;
}

.pp-form-row-responsive {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
  padding-top: 4px !important;
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
.pp-spinner {
  width: 16px !important;
  height: 16px !important;
  border: 2px solid rgba(255, 255, 255, 0.3) !important;
  border-top-color: #fff !important;
  border-radius: 50% !important;
  animation: pp-spin 0.6s linear infinite !important;
}

.pp-spinner-dark {
  border-color: rgba(0, 0, 0, 0.1) !important;
  border-top-color: var(--pp-primary) !important;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.pp-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 20px !important;
  margin-top: 24px !important;
}

.pp-footer a {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: var(--pp-on-surface-variant) !important;
  text-decoration: none !important;
  display: inline !important;
}

.pp-powered {
  text-align: center !important;
  margin-top: 12px !important;
  font-size: 12px !important;
  color: var(--pp-on-surface-variant) !important;
}

.pp-powered strong {
  color: var(--pp-primary) !important;
  font-weight: 600 !important;
}

/* ── Links ───────────────────────────────────────────────────────────────── */
.pp-forgot-link {
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--pp-primary) !important;
  text-decoration: none !important;
  white-space: nowrap !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  cursor: pointer !important;
  display: inline !important;
}

.pp-link {
  color: var(--pp-primary) !important;
  text-decoration: none !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  font-size: inherit !important;
  display: inline !important;
}

.pp-back {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  color: var(--pp-on-surface-variant) !important;
  text-decoration: none !important;
  cursor: pointer !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
}

.pp-back svg {
  width: 16px !important;
  height: 16px !important;
}

/* ── Utilities ───────────────────────────────────────────────────────────── */
.pp-sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border-width: 0 !important;
}
`;
