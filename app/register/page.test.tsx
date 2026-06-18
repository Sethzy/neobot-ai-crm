/**
 * Tests for the register page.
 * @module app/register/page
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterPageClient from "./page-client";

const mockSignUp = vi.fn();
const mockCaptureOrQueueEmailAuthEvent = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}));

vi.mock("@/lib/analytics/posthog-auth-events", () => ({
  captureOrQueueEmailAuthEvent: (...args: unknown[]) => mockCaptureOrQueueEmailAuthEvent(...args),
}));

describe("/register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureOrQueueEmailAuthEvent.mockResolvedValue(undefined);
    mockSignUp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "seth@example.com",
          user_metadata: { display_name: "Seth Lim" },
          identities: [{ id: "identity-1" }],
        },
      },
      error: null,
    });
  });

  it("shows email signup without a Google OAuth button", () => {
    render(<RegisterPageClient />);

    expect(screen.getByRole("heading", { name: /get started for free/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
  });

  it("submits a simplified full-name signup form with display metadata", async () => {
    render(<RegisterPageClient />);

    expect(screen.getByRole("heading", { name: /get started for free/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Seth Lim" },
    });
    fireEvent.change(screen.getByLabelText(/^email address$/i), {
      target: { value: "seth@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "seth@example.com",
        password: "secret123",
        options: {
          data: {
            display_name: "Seth Lim",
            first_name: "Seth",
            last_name: "Lim",
          },
          emailRedirectTo: "http://localhost:3000/auth/confirm",
        },
      });
      expect(mockCaptureOrQueueEmailAuthEvent).toHaveBeenCalledWith({
        event: "signed_up",
        supabase: expect.any(Object),
        user: {
          id: "user-1",
          email: "seth@example.com",
          user_metadata: { display_name: "Seth Lim" },
          identities: [{ id: "identity-1" }],
        },
      });
    });
  });
});
