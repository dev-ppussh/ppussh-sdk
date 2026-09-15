import { createContext, useContext, useState, type ReactNode } from "react";
import { resolveConfig, type PPUSSHAuthConfig, type ResolvedPPUSSHConfig } from "../config";
import { generateState } from "../oidc";

export interface PPUSSHContextValue {
  config: ResolvedPPUSSHConfig;
  /** OIDC state for this auth transaction. */
  state: string;
}

const PPUSSHContext = createContext<PPUSSHContextValue | null>(null);

export interface PPUSSHProviderProps {
  config: PPUSSHAuthConfig;
  /** OIDC state. Generated per mount when omitted. */
  state?: string;
  children: ReactNode;
}

export function PPUSSHProvider({ config, state, children }: PPUSSHProviderProps): React.JSX.Element {
  const [resolved] = useState<ResolvedPPUSSHConfig>(() => resolveConfig(config));
  const [txState] = useState<string>(() => state ?? generateState());
  return <PPUSSHContext.Provider value={{ config: resolved, state: txState }}>{children}</PPUSSHContext.Provider>;
}

export function usePPUSSH(): PPUSSHContextValue {
  const ctx = useContext(PPUSSHContext);
  if (!ctx) {
    throw new Error("[ppussh] usePPUSSH must be used inside <PPUSSHProvider>");
  }
  return ctx;
}
