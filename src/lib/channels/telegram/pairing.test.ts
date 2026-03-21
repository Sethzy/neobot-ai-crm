/**
 * Tests for Telegram pairing token helpers.
 * @module lib/channels/telegram/pairing.test
 */
import { describe, expect, it } from "vitest";

import { generatePairingToken, isPairingTokenFormat } from "./pairing";

describe("generatePairingToken", () => {
  it("returns base64url-safe strings", () => {
    expect(generatePairingToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("stays within Telegram's /start parameter limit", () => {
    expect(generatePairingToken().length).toBeLessThanOrEqual(64);
  });

  it("generates unique values", () => {
    expect(generatePairingToken()).not.toBe(generatePairingToken());
  });
});

describe("isPairingTokenFormat", () => {
  it("accepts valid base64url tokens", () => {
    expect(isPairingTokenFormat("abc123_-XYZ")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isPairingTokenFormat("")).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(isPairingTokenFormat("abc 123")).toBe(false);
    expect(isPairingTokenFormat("abc+123")).toBe(false);
  });

  it("rejects tokens longer than 64 characters", () => {
    expect(isPairingTokenFormat("a".repeat(65))).toBe(false);
  });
});
