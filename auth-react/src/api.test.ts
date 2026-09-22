import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeSignin, authorizeSignup, forgotPassword, grantConsent, resendVerification, socialAuthorize, verifyEmailToken } from "./api";
import { PPUSSHError } from "./errors";

const BASE = "https://gateway.test";

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      body === null || body === undefined
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status }),
    ) as unknown as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const signinReq = {
  clientId: "client-1",
  redirectUri: "https://product.com/auth/callback",
  state: "s1",
  email: "user@test.com",
  password: "secret",
};

describe("authorizeSignin", () => {
  it("returns authorized with code parsed from redirect_url", async () => {
    mockFetchOnce(200, {
      redirect_url: "https://product.com/auth/callback?code=code1&state=s1",
    });
    const result = await authorizeSignin(BASE, signinReq);
    expect(result).toEqual({ status: "authorized", code: "code1", state: "s1" });
  });

  it("returns consent_required with product info", async () => {
    mockFetchOnce(403, {
      status: "CONSENT_REQUIRED",
      client_id: "client-1",
      product_name: "Demo",
      product_description: "Demo product",
      product_base_url: "https://product.com",
    });
    const result = await authorizeSignin(BASE, signinReq);
    expect(result.status).toBe("consent_required");
    if (result.status === "consent_required") {
      expect(result.product.product_name).toBe("Demo");
    }
  });

  it("throws invalid_credentials on 401", async () => {
    mockFetchOnce(401, { detail: "Invalid credentials" });
    try {
      await authorizeSignin(BASE, signinReq);
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).code).toBe("invalid_credentials");
    }
  });

  it("throws email_verification_required on 202", async () => {
    mockFetchOnce(202, { message: "Check email", user_id: "u1" });
    try {
      await authorizeSignin(BASE, signinReq);
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).code).toBe("email_verification_required");
    }
  });

  it("sends credentials with the request", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ redirect_url: "https://product.com/auth/callback?code=c&state=s1" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await authorizeSignin(BASE, signinReq);
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.credentials).toBe("include");
  });

  it("sends X-PPUSSH-Client-ID derived from body client_id", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ redirect_url: "https://product.com/auth/callback?code=c&state=s1" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await authorizeSignin(BASE, signinReq);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)["X-PPUSSH-Client-ID"]).toBe("client-1");
  });
});

describe("grantConsent", () => {
  it("returns code parsed from redirect_url", async () => {
    mockFetchOnce(200, {
      redirect_url: "https://product.com/auth/callback?code=code2&state=s1",
    });
    const result = await grantConsent(BASE, {
      clientId: "client-1",
      redirectUri: "https://product.com/auth/callback",
      state: "s1",
    });
    expect(result).toEqual({ code: "code2", state: "s1" });
  });
});

describe("authorizeSignup", () => {
  const signupReq = {
    clientId: "client-1",
    redirectUri: "https://product.com/auth/callback",
    state: "s1",
    name: "Ada",
    email: "ada@test.com",
    password: "Correct-horse-1",
  };

  it("returns userId on 202", async () => {
    mockFetchOnce(202, { message: "Check email", user_id: "u1" });
    const result = await authorizeSignup(BASE, signupReq);
    expect(result).toEqual({ userId: "u1" });
  });

  it("throws on 409 duplicate", async () => {
    mockFetchOnce(409, { detail: "Email already registered" });
    try {
      await authorizeSignup(BASE, signupReq);
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).status).toBe(409);
    }
  });
});

describe("socialAuthorize", () => {
  it("returns the provider URL", async () => {
    mockFetchOnce(200, { redirect_url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    const url = await socialAuthorize(BASE, {
      provider: "google",
      clientId: "client-1",
      redirectUri: "https://product.com/auth/callback",
      state: "s1",
    });
    expect(url).toContain("accounts.google.com");
  });

  it("throws on non-200", async () => {
    mockFetchOnce(400, { detail: "Unsupported provider" });
    try {
      await socialAuthorize(BASE, {
        provider: "github",
        clientId: "client-1",
        redirectUri: "https://product.com/auth/callback",
        state: "s1",
      });
      expect.unreachable();
    } catch (err) {
      expect((err as PPUSSHError).status).toBe(400);
    }
  });
});

describe("verifyEmailToken", () => {
  it("returns code parsed from redirect_url", async () => {
    mockFetchOnce(200, {
      redirect_url: "https://product.com/auth/callback?code=code3&state=s1",
    });
    const result = await verifyEmailToken(BASE, {
      token: "tok",
      clientId: "client-1",
      redirectUri: "https://product.com/auth/callback",
      state: "s1",
    });
    expect(result).toEqual({ code: "code3", state: "s1" });
  });
});

describe("resendVerification and forgotPassword", () => {
  it("resolves on 204", async () => {
    mockFetchOnce(204, null);
    await resendVerification(BASE, "ada@test.com", "client-1");
    mockFetchOnce(204, null);
    await forgotPassword(BASE, "ada@test.com", "client-1");
  });

  it("sends X-PPUSSH-Client-ID from the explicit clientId argument", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await forgotPassword(BASE, "ada@test.com", "client-1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)["X-PPUSSH-Client-ID"]).toBe("client-1");
  });

  it("reads the message from the ErrorResponse envelope", async () => {
    mockFetchOnce(500, { error: "boom", detail: "", request_id: "r1" });
    await expect(resendVerification(BASE, "ada@test.com", "client-1")).rejects.toThrow("boom");
  });
});
