import { describe, expect, it } from "vitest";
import { PPUSSHError } from "./errors";
import { buildLoginUrl, generateState, parseAuthResult } from "./oidc";

describe("generateState", () => {
  it("returns unique base64url strings", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});

describe("buildLoginUrl", () => {
  it("builds the Accounts login URL with OIDC params", () => {
    const url = buildLoginUrl("https://accounts.ppussh.com/", {
      clientId: "client-1",
      redirectUri: "https://product.com/auth/callback",
      state: "s1",
    });
    expect(url).toBe(
      "https://accounts.ppussh.com/login?client_id=client-1&redirect_uri=https%3A%2F%2Fproduct.com%2Fauth%2Fcallback&state=s1",
    );
  });

  it("supports the presentation-only display hint", () => {
    const url = buildLoginUrl("https://accounts.ppussh.com", {
      clientId: "c",
      redirectUri: "https://p.test/cb",
      state: "s",
      display: "popup",
    });
    expect(url).toContain("display=popup");
  });
});

describe("parseAuthResult", () => {
  it("extracts code and state from the continuation URL", () => {
    const result = parseAuthResult("https://product.com/auth/callback?code=abc123&state=s1", "s1");
    expect(result).toEqual({ code: "abc123", state: "s1" });
  });

  it("throws missing_code when no code is present", () => {
    try {
      parseAuthResult("https://product.com/auth/callback?state=s1", "s1");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PPUSSHError);
      expect((err as PPUSSHError).code).toBe("missing_code");
    }
  });

  it("throws state_mismatch when the echo differs", () => {
    try {
      parseAuthResult("https://product.com/auth/callback?code=abc&state=other", "s1");
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).code).toBe("state_mismatch");
    }
  });

  it("throws invalid_response for unparseable URLs", () => {
    try {
      parseAuthResult("not a url");
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).code).toBe("invalid_response");
    }
  });
});
