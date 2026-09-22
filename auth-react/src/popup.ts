import { PPUSSHError } from "./errors";

export const AUTH_COMPLETE_MESSAGE = "ppussh-auth-complete";
export const AUTH_ERROR_MESSAGE = "ppussh-auth-error";

export interface PopupAuthResult {
  code: string;
  state: string;
}

interface CompleteMessage {
  type: typeof AUTH_COMPLETE_MESSAGE;
  code: unknown;
  state: unknown;
}

interface ErrorMessage {
  type: typeof AUTH_ERROR_MESSAGE;
  error: unknown;
  errorDescription: unknown;
  state: unknown;
}

function isCompleteMessage(data: unknown): data is CompleteMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record["type"] === AUTH_COMPLETE_MESSAGE;
}

function isErrorMessage(data: unknown): data is ErrorMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record["type"] === AUTH_ERROR_MESSAGE;
}

/** Open a centered auth popup. Throws `popup_blocked` when blocked. */
export function openAuthPopup(url: string, name = "ppussh-auth", width = 520, height = 680): Window {
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no`;
  const popup = window.open(url, name, features);
  if (!popup || popup.closed) {
    throw new PPUSSHError("popup_blocked", "Popup was blocked — please allow popups or continue in full page");
  }
  try {
    popup.focus();
  } catch {
    // Focusing is best-effort; ignore cross-origin focus errors.
  }
  return popup;
}

export interface WaitForPopupOptions {
  /** Expected origin of the completion message (the product's own origin). */
  expectedOrigin: string;
  expectedState?: string;
  timeoutMs?: number;
}

/**
 * How long `popup.closed` must stay true before we treat it as a real cancel.
 * Cross-origin navigations (about:blank → provider → callback) can briefly
 * report `closed=true` even though the popup is still open — rejecting on the
 * first sighting caused false "Authentication was cancelled" errors.
 */
const CLOSED_GRACE_MS = 1500;

/**
 * Wait for the product callback page (running inside the popup) to post the
 * auth code back. Validates origin, source, and state.
 */
export function waitForPopupResult(popup: Window, opts: WaitForPopupOptions): Promise<PopupAuthResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  return new Promise<PopupAuthResult>((resolve, reject) => {
    let settled = false;
    let closedSince: number | null = null;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new PPUSSHError("timeout", "Authentication timed out"));
    }, timeoutMs);
    const closedPoll = window.setInterval(() => {
      try {
        if (popup.closed) {
          const now = Date.now();
          if (closedSince === null) {
            closedSince = now;
          } else if (now - closedSince >= CLOSED_GRACE_MS) {
            cleanup();
            if (!settled) {
              settled = true;
              reject(new PPUSSHError("popup_closed", "Authentication was cancelled"));
            }
          }
        } else {
          closedSince = null;
        }
      } catch {
        // Cross-origin access to popup.closed can throw; ignore and keep waiting.
        closedSince = null;
      }
    }, 500);

    function cleanup(): void {
      window.clearTimeout(timer);
      window.clearInterval(closedPoll);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent): void {
      if (settled || event.origin !== opts.expectedOrigin || event.source !== popup) {
        return;
      }
      if (isErrorMessage(event.data)) {
        settled = true;
        cleanup();
        const detail =
          typeof event.data.errorDescription === "string" && event.data.errorDescription
            ? event.data.errorDescription
            : "Social sign-in failed";
        reject(new PPUSSHError("social_failed", detail));
        return;
      }
      if (!isCompleteMessage(event.data)) {
        return;
      }
      if (typeof event.data.code !== "string" || !event.data.code) {
        return;
      }
      const state = typeof event.data.state === "string" ? event.data.state : "";
      if (opts.expectedState !== undefined && state !== opts.expectedState) {
        settled = true;
        cleanup();
        reject(new PPUSSHError("state_mismatch", "State mismatch in popup result"));
        return;
      }
      settled = true;
      cleanup();
      resolve({ code: event.data.code, state });
    }

    window.addEventListener("message", onMessage);
  });
}

export type PopupCallbackOutcome = "posted" | "no-opener";

/**
 * Runs on the product's existing callback route inside the popup: forwards
 * code/error to the opener and closes. Returns "no-opener" when this page was
 * loaded as a normal navigation so the product's standard callback logic runs.
 */
export function completePopupCallback(openerOrigin: string): PopupCallbackOutcome {
  if (!window.opener) {
    return "no-opener";
  }
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state") ?? "";
  if (code) {
    window.opener.postMessage({ type: AUTH_COMPLETE_MESSAGE, code, state }, openerOrigin);
  } else {
    window.opener.postMessage(
      {
        type: AUTH_ERROR_MESSAGE,
        error: params.get("error") ?? "unknown",
        errorDescription: params.get("error_description") ?? params.get("message") ?? "",
        state,
      },
      openerOrigin,
    );
  }
  window.close();
  return "posted";
}
