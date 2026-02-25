/**
 * Tests for auth guard logic.
 * Tests the redirect rules for authenticated/unauthenticated users.
 */
import { describe, it, expect } from "vitest";
import { getAuthRedirect } from "./auth";
import type { Session } from "@supabase/supabase-js";

// Mock session for authenticated user
const mockSession: Session = {
  access_token: "test-token",
  refresh_token: "test-refresh",
  expires_in: 3600,
  expires_at: Date.now() + 3600,
  token_type: "bearer",
  user: {
    id: "user-123",
    email: "test@example.com",
    aud: "authenticated",
    created_at: "2024-01-01",
    app_metadata: {},
    user_metadata: {},
  },
};

describe("getAuthRedirect", () => {
  describe("unauthenticated user", () => {
    it("allows access to landing page", () => {
      const redirect = getAuthRedirect("/", null);
      expect(redirect).toBeNull();
    });

    it("allows access to login page", () => {
      const redirect = getAuthRedirect("/login", null);
      expect(redirect).toBeNull();
    });

    it("allows access to register page", () => {
      const redirect = getAuthRedirect("/register", null);
      expect(redirect).toBeNull();
    });

    it("allows access to forgot-password page", () => {
      const redirect = getAuthRedirect("/forgot-password", null);
      expect(redirect).toBeNull();
    });

    it("allows access to update-password page", () => {
      const redirect = getAuthRedirect("/update-password", null);
      expect(redirect).toBeNull();
    });

    it("allows access to auth/confirm page", () => {
      const redirect = getAuthRedirect("/auth/confirm", null);
      expect(redirect).toBeNull();
    });

    it("redirects to login from protected route /cases", () => {
      const redirect = getAuthRedirect("/cases", null);
      expect(redirect).toBe("/login");
    });

    it("redirects to login from protected route /cases/123", () => {
      const redirect = getAuthRedirect("/cases/123", null);
      expect(redirect).toBe("/login");
    });

    it("redirects to login from any protected route", () => {
      const redirect = getAuthRedirect("/settings", null);
      expect(redirect).toBe("/login");
    });
  });

  describe("authenticated user", () => {
    it("allows access to landing page", () => {
      const redirect = getAuthRedirect("/", mockSession);
      expect(redirect).toBeNull();
    });

    it("redirects from login to /chat", () => {
      const redirect = getAuthRedirect("/login", mockSession);
      expect(redirect).toBe("/chat");
    });

    it("redirects from register to /chat", () => {
      const redirect = getAuthRedirect("/register", mockSession);
      expect(redirect).toBe("/chat");
    });

    it("allows access to /cases", () => {
      const redirect = getAuthRedirect("/cases", mockSession);
      expect(redirect).toBeNull();
    });

    it("allows access to /cases/123", () => {
      const redirect = getAuthRedirect("/cases/123", mockSession);
      expect(redirect).toBeNull();
    });

    it("allows access to forgot-password (for password change)", () => {
      const redirect = getAuthRedirect("/forgot-password", mockSession);
      expect(redirect).toBeNull();
    });

    it("allows access to update-password", () => {
      const redirect = getAuthRedirect("/update-password", mockSession);
      expect(redirect).toBeNull();
    });
  });
});
