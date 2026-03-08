/**
 * Tests for the login page.
 * @module app/login/page
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

const mockReplace = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  },
}));

describe("/login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com" }, error: null });
    mockSignInWithPassword.mockResolvedValue({ error: null });
  });

  it("starts Google OAuth from the dedicated sign-in screen", async () => {
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <LoginPage searchParams={Promise.resolve({})} />
        </Suspense>,
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: /sign in to your account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?next=%2Fchat",
        },
      });
    });
  });

  it("redirects password sign-in to chat by default", async () => {
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <LoginPage searchParams={Promise.resolve({})} />
        </Suspense>,
      );
      await Promise.resolve();
    });

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
      expect(mockReplace).toHaveBeenCalledWith("/chat");
    });
  });
});
