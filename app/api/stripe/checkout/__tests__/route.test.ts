/**
 * Tests for the Stripe checkout fallback route.
 * @module app/api/stripe/checkout/__tests__/route
 */
import { describe, expect, it, vi } from "vitest";

const { mockSyncBillingStateFromCheckoutSession } = vi.hoisted(() => ({
  mockSyncBillingStateFromCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/stripe/stripe", () => ({
  syncBillingStateFromCheckoutSession: mockSyncBillingStateFromCheckoutSession,
}));

describe("GET /api/stripe/checkout", () => {
  it("redirects back to pricing when the session id is missing", async () => {
    const { GET } = await import("../route");

    const response = await GET(new Request("http://localhost/api/stripe/checkout"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/pricing");
  });

  it("redirects to settings after a successful fallback sync", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/stripe/checkout?session_id=cs_test_123"),
    );

    expect(mockSyncBillingStateFromCheckoutSession).toHaveBeenCalledWith("cs_test_123");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/settings?billing=success");
  });

  it("redirects back to pricing with an error flag when sync fails", async () => {
    mockSyncBillingStateFromCheckoutSession.mockRejectedValueOnce(new Error("sync failed"));
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/stripe/checkout?session_id=cs_test_123"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/pricing?billing=error");
  });
});
