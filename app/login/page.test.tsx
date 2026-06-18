/**
 * Tests for the login page.
 * @module app/login/page
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPageClient from "./page-client";

const mockReplace = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockCaptureOrQueueEmailAuthEvent = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  },
}));

vi.mock("@/lib/analytics/posthog-auth-events", () => ({
  captureOrQueueEmailAuthEvent: (...args: unknown[]) => mockCaptureOrQueueEmailAuthEvent(...args),
}));

describe("/login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureOrQueueEmailAuthEvent.mockResolvedValue(undefined);
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "seth@example.com",
          user_metadata: { display_name: "Seth Lim" },
        },
      },
      error: null,
    });
  });

  it("shows email sign-in without a Google OAuth button", async () => {
    render(<LoginPageClient />);

    expect(await screen.findByRole("heading", { name: /sign in to your account/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
  });

  it("redirects password sign-in to chat by default", async () => {
    render(<LoginPageClient />);

    fireEvent.change(await screen.findByLabelText(/email address/i), {
      target: { value: "seth@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "seth@example.com",
        password: "secret123",
      });
      expect(mockCaptureOrQueueEmailAuthEvent).toHaveBeenCalledWith({
        event: "signed_in",
        supabase: expect.any(Object),
        user: {
          id: "user-1",
          email: "seth@example.com",
          user_metadata: { display_name: "Seth Lim" },
        },
      });
      expect(mockReplace).toHaveBeenCalledWith("/chat");
    });
  });
});
