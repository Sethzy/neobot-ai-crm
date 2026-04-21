/**
 * Tests for Telegram pairing token helpers.
 * @module lib/channels/telegram/pairing.test
 */
import { describe, expect, it } from "vitest";

import {
  generatePairingDisplayCode,
  generatePairingToken,
  isPairingDisplayCodeFormat,
  isPairingTokenFormat,
  normalizePairingDisplayCode,
} from "./pairing";

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

describe("generatePairingDisplayCode", () => {
  it("returns a short manual code with a stable human-friendly format", () => {
    expect(generatePairingDisplayCode()).toMatch(/^[A-Z]{2}-[A-Z0-9]{6}$/);
  });

  it("generates unique values", () => {
    expect(generatePairingDisplayCode()).not.toBe(generatePairingDisplayCode());
  });
});

describe("normalizePairingDisplayCode", () => {
  it("trims whitespace and uppercases user input", () => {
    expect(normalizePairingDisplayCode(" gw-22e14a ")).toBe("GW-22E14A");
  });
});

describe("isPairingDisplayCodeFormat", () => {
  it("accepts valid display codes regardless of source casing", () => {
    expect(isPairingDisplayCodeFormat("GW-22E14A")).toBe(true);
    expect(isPairingDisplayCodeFormat("gw-22e14a")).toBe(true);
  });

  it("rejects values that do not match the fixed short-code shape", () => {
    expect(isPairingDisplayCodeFormat("GW22E14A")).toBe(false);
    expect(isPairingDisplayCodeFormat("TOO-LONG99")).toBe(false);
    expect(isPairingDisplayCodeFormat("abc123_-XYZ")).toBe(false);
  });
});
