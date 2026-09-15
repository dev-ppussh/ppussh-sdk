export type PPUSSHErrorCode =
  | "network_error"
  | "invalid_credentials"
  | "email_verification_required"
  | "invalid_response"
  | "missing_code"
  | "state_mismatch"
  | "authorization_denied"
  | "popup_blocked"
  | "popup_closed"
  | "social_failed"
  | "timeout"
  | "unknown";

export class PPUSSHError extends Error {
  readonly code: PPUSSHErrorCode;
  readonly status?: number;

  constructor(code: PPUSSHErrorCode, message: string, status?: number) {
    super(message);
    this.name = "PPUSSHError";
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}
