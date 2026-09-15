export interface PPUSSHAuthConfig {
  /** Origin of the Accounts frontend, e.g. https://accounts.ppussh.com */
  accountsUrl: string;
  /**
   * Base URL for Accounts JSON APIs (the gateway in production).
   * Defaults to `accountsUrl`.
   */
  apiBaseUrl?: string;
  /** Product client ID (UUID) issued by Accounts. */
  clientId: string;
  /** Registered product callback URL. Never changed by the SDK. */
  redirectUri: string;
  scope?: string;
}

export interface ResolvedPPUSSHConfig {
  accountsUrl: string;
  apiBaseUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

function normalizeOrigin(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`[ppussh] ${field} is required`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`[ppussh] invalid ${field}: ${value}`);
  }
  return url.origin;
}

export function resolveConfig(config: PPUSSHAuthConfig): ResolvedPPUSSHConfig {
  if (!config.clientId) {
    throw new Error("[ppussh] clientId is required");
  }
  if (!config.redirectUri) {
    throw new Error("[ppussh] redirectUri is required");
  }
  const accountsUrl = normalizeOrigin(config.accountsUrl, "accountsUrl");
  return {
    accountsUrl,
    apiBaseUrl: config.apiBaseUrl
      ? normalizeOrigin(config.apiBaseUrl, "apiBaseUrl")
      : accountsUrl,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    ...(config.scope ? { scope: config.scope } : {}),
  };
}
