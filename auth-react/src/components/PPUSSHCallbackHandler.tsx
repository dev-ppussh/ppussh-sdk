import { useEffect } from "react";
import { completePopupCallback } from "../popup";

export interface DirectNavigationResult {
  code?: string;
  state?: string;
  error?: string;
}

export interface PPUSSHCallbackHandlerProps {
  /** Origin of the page that opened the popup (the product's own origin). */
  openerOrigin: string;
  /** Called when this page was loaded as a normal navigation (no opener). */
  onDirectNavigation?: (result: DirectNavigationResult) => void;
}

/**
 * Mount on the product's existing callback route. Inside a popup it forwards
 * the code/error to the opener and closes; on direct navigation it delegates
 * to the product's standard callback logic via onDirectNavigation.
 */
export function PPUSSHCallbackHandler({
  openerOrigin,
  onDirectNavigation,
}: PPUSSHCallbackHandlerProps): null {
  useEffect(() => {
    const outcome = completePopupCallback(openerOrigin);
    if (outcome === "no-opener" && onDirectNavigation) {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        onDirectNavigation({ code, state: params.get("state") ?? "" });
      } else {
        onDirectNavigation({ error: params.get("error") ?? "unknown" });
      }
    }
  }, [openerOrigin, onDirectNavigation]);
  return null;
}
