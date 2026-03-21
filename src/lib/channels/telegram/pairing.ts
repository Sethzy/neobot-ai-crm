/**
 * Telegram deep-link pairing token helpers.
 * @module lib/channels/telegram/pairing
 */
import { randomBytes } from "node:crypto";

/** Ten-minute validity window for pairing links. */
export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Generates a cryptographically random base64url pairing token. */
export function generatePairingToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Validates Telegram `/start` token format and length constraints. */
export function isPairingTokenFormat(token: string): boolean {
  if (!token || token.length > 64) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(token);
}
