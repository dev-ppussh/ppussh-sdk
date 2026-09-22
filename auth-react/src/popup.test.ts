import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForPopupResult } from "./popup";

const ORIGIN = "https://product.example";

type Listener = (event: unknown) => void;

/**
 * The suite runs in the default node environment (no jsdom). `waitForPopupResult`
 * only needs window timers + a message listener, so stub just those.
 * Must be called after vi.useFakeTimers() so the stubs pick up the fakes.
 */
function stubWindow(): { listeners: Listener[] } {
  const listeners: Listener[] = [];
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    addEventListener: (_type: string, fn: Listener) => {
      listeners.push(fn);
    },
    removeEventListener: (_type: string, fn: Listener) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  });
  return { listeners };
}

function popupStub(): { closed: boolean } {
  return { closed: false };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("waitForPopupResult popup.closed grace period", () => {
  it("does not reject immediately when popup.closed flips true", async () => {
    vi.useFakeTimers();
    stubWindow();
    const popup = popupStub();
    popup.closed = true;
    let rejected = false;
    void waitForPopupResult(popup as unknown as Window, { expectedOrigin: ORIGIN }).catch(() => {
      rejected = true;
    });

    // First poll sighting at 500ms — only starts the grace window.
    await vi.advanceTimersByTimeAsync(500);
    expect(rejected).toBe(false);

    // Still inside the 1500ms grace window.
    await vi.advanceTimersByTimeAsync(900);
    expect(rejected).toBe(false);
  });

  it("rejects popup_closed after the grace window expires", async () => {
    vi.useFakeTimers();
    stubWindow();
    const popup = popupStub();
    popup.closed = true;
    const err = waitForPopupResult(popup as unknown as Window, {
      expectedOrigin: ORIGIN,
    }).then(
      () => null,
      (e: unknown) => e as { code?: string },
    );

    // 500ms first sighting + 1500ms grace → rejection by ~2000ms.
    await vi.advanceTimersByTimeAsync(3000);
    const result = await err;
    expect(result).not.toBeNull();
    expect(result?.code).toBe("popup_closed");
  });

  it("keeps waiting when closed is transient (cross-origin nav glitch)", async () => {
    vi.useFakeTimers();
    stubWindow();
    const popup = popupStub();
    let outcome: "pending" | "popup_closed" | "other" = "pending";
    void waitForPopupResult(popup as unknown as Window, { expectedOrigin: ORIGIN }).catch(
      (e: { code?: string }) => {
        outcome = e.code === "popup_closed" ? "popup_closed" : "other";
      },
    );

    // Closed at first poll, back open before the grace window elapses.
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    popup.closed = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(outcome).toBe("pending");

    // Closed glitch again later, then open — still no cancel.
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    popup.closed = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(outcome).toBe("pending");
  });

  it("keeps waiting when reading popup.closed throws", async () => {
    vi.useFakeTimers();
    stubWindow();
    const popup = {
      get closed(): boolean {
        throw new Error("cross-origin");
      },
    };
    let outcome: "pending" | "rejected" = "pending";
    void waitForPopupResult(popup as unknown as Window, { expectedOrigin: ORIGIN }).catch(() => {
      outcome = "rejected";
    });

    await vi.advanceTimersByTimeAsync(3000);
    // Cross-origin throws are ignored — never a false cancel. (timeoutMs default
    // is 10 minutes, so the promise is still pending here.)
    expect(outcome).toBe("pending");
  });
});
