/** Tests for sprite job CRUD + HMAC helpers. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { deriveJobToken, formatResultForChat } from "../sprite-jobs";

describe("deriveJobToken", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "test-secret-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produces a hex string", () => {
    const token = deriveJobToken("job-123");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same jobId", () => {
    const a = deriveJobToken("job-123");
    const b = deriveJobToken("job-123");
    expect(a).toBe(b);
  });

  it("produces different tokens for different jobIds", () => {
    const a = deriveJobToken("job-123");
    const b = deriveJobToken("job-456");
    expect(a).not.toBe(b);
  });
});

describe("formatResultForChat", () => {
  it("formats analyze result with download link", () => {
    const result = formatResultForChat("analyze", {
      summary: "Cap rate is 5.2%",
      downloadUrl: "https://storage.example.com/result.xlsx",
    });
    expect(result).toContain("Cap rate is 5.2%");
    expect(result).toContain("[Download result]");
    expect(result).toContain("https://storage.example.com/result.xlsx");
  });

  it("formats error result", () => {
    const result = formatResultForChat("analyze", {
      error: "Analysis failed. Want me to try again?",
    });
    expect(result).toBe("Analysis failed. Want me to try again?");
  });

  it("formats artifact result with preview URL", () => {
    const result = formatResultForChat("artifact", {
      summary: "Property showcase ready",
      previewUrl: "https://showcase.sprites.app",
    });
    expect(result).toContain("Property showcase ready");
    expect(result).toContain("https://showcase.sprites.app");
  });

  it("handles missing summary gracefully", () => {
    const result = formatResultForChat("analyze", {});
    expect(result).toBe("Analysis complete.");
  });
});
