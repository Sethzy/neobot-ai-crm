/**
 * Tests for the auth confirmation page.
 * @module app/auth/confirm/page
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfirmPage from "./page";

const mockPush = vi.fn();
const mockGetSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

describe("/auth/confirm page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("redirects confirmed users to chat", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });

    await act(async () => {
      render(<ConfirmPage />);
      await Promise.resolve();
    });

    expect(mockGetSession).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPush).toHaveBeenCalledWith("/chat");
  });
});
