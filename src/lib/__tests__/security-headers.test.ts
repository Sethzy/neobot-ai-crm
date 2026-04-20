/** Tests that security header config produces the expected header set. */
import { describe, it, expect } from "vitest";
import { defaultPermissionsPolicy, securityHeaders } from "../security-headers";

describe("securityHeaders", () => {
  it("includes X-Frame-Options DENY", () => {
    const header = securityHeaders.find((h) => h.key === "X-Frame-Options");
    expect(header?.value).toBe("DENY");
  });

  it("includes X-Content-Type-Options nosniff", () => {
    const header = securityHeaders.find(
      (h) => h.key === "X-Content-Type-Options",
    );
    expect(header?.value).toBe("nosniff");
  });

  it("includes Referrer-Policy", () => {
    const header = securityHeaders.find((h) => h.key === "Referrer-Policy");
    expect(header?.value).toBe("strict-origin-when-cross-origin");
  });

  it("includes Permissions-Policy", () => {
    const header = securityHeaders.find((h) => h.key === "Permissions-Policy");
    expect(header?.value).toBe(defaultPermissionsPolicy);
  });

  it("allows microphone for the app document while keeping camera and geolocation blocked", () => {
    const header = securityHeaders.find((h) => h.key === "Permissions-Policy");

    expect(header?.value).toContain("camera=()");
    expect(header?.value).toContain("microphone=(self)");
    expect(header?.value).toContain("geolocation=()");
  });

  it("includes Content-Security-Policy-Report-Only (not enforcing)", () => {
    const csp = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );
    expect(csp).toBeDefined();
    expect(csp?.value).toContain("default-src 'self'");
    // Should NOT have an enforcing CSP header
    const enforcing = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy",
    );
    expect(enforcing).toBeUndefined();
  });

  it("includes connect-src and img-src directives in CSP", () => {
    const csp = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );
    expect(csp?.value).toContain("connect-src");
    expect(csp?.value).toContain("img-src");
  });

  it("does not produce double-protocol origins like https://https://", () => {
    const csp = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );
    expect(csp?.value).not.toContain("https://https://");
  });
});
