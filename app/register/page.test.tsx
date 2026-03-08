/**
 * Tests for the register page.
 * @module app/register/page
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterPage from "./page";

const mockSignInWithOAuth = vi.fn();
const mockSignUp = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}));

describe("/register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com" }, error: null });
    mockSignUp.mockResolvedValue({
      data: { user: { identities: [{ id: "identity-1" }] } },
      error: null,
    });
  });

  it("submits a simplified full-name signup form with display metadata", async () => {
    render(<RegisterPage />);

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
    });
  });

  it("starts Google OAuth from the signup screen", async () => {
    render(<RegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign up with google/i }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?next=%2Fchat",
        },
      });
    });
  });
});
