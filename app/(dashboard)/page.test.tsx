/**
 * Tests for dashboard root redirect behavior.
 * @module app/(dashboard)/page.test
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("dashboard root page", () => {
  it("redirects to /chat", async () => {
    const module = await import("./page");

    module.default();

    expect(mockRedirect).toHaveBeenCalledWith("/chat");
  });
});
