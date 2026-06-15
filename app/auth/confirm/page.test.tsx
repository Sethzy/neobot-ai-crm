/**
 * Tests for the auth confirmation page.
 * @module app/auth/confirm/page
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfirmPageClient from "./page-client";

const mockPush = vi.fn();
const mockGetUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

describe("/auth/confirm page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("redirects confirmed users to chat", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    await act(async () => {
      render(<ConfirmPageClient />);
      await Promise.resolve();
    });

    expect(mockGetUser).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPush).toHaveBeenCalledWith("/chat");
  });
});
