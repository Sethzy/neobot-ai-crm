/**
 * Tests for the Stripe Checkout fallback route.
 * @module app/api/stripe/checkout/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSyncBillingStateFromCheckoutSession } = vi.hoisted(() => ({
  mockSyncBillingStateFromCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/stripe/stripe", () => ({
  syncBillingStateFromCheckoutSession: (...args: unknown[]) =>
    mockSyncBillingStateFromCheckoutSession(...args),
}));

describe("GET /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects back to pricing when the session id is missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/stripe/checkout"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/pricing");
  });

  it("redirects to /settings/billing after a successful sync", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/stripe/checkout?session_id=cs_test_123"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/settings/billing?billing=success");
    expect(mockSyncBillingStateFromCheckoutSession).toHaveBeenCalledWith("cs_test_123");
  });

  it("redirects to pricing error state when sync fails", async () => {
    const { GET } = await import("./route");

    mockSyncBillingStateFromCheckoutSession.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(
      new Request("http://localhost/api/stripe/checkout?session_id=cs_test_456"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/pricing?billing=error");
  });
});
