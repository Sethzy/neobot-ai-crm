/**
 * Telegram deep-link pairing token helpers.
 * @module lib/channels/telegram/pairing
 */
import { randomBytes } from "node:crypto";

/** Ten-minute validity window for pairing links. */
export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;

const DISPLAY_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DISPLAY_CODE_ALPHABET = `${DISPLAY_CODE_LETTERS}23456789`;

/** Generates a cryptographically random base64url pairing token. */
export function generatePairingToken(): string {
  return randomBytes(16).toString("base64url");
}

function randomFromAlphabet(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/** Generates a short human-friendly pairing code for manual Telegram entry. */
export function generatePairingDisplayCode(): string {
  const prefix = randomFromAlphabet(DISPLAY_CODE_LETTERS, 2);
  const suffix = randomFromAlphabet(DISPLAY_CODE_ALPHABET, 6);
  return `${prefix}-${suffix}`;
}

/** Normalizes manual pairing codes from user input before lookup. */
export function normalizePairingDisplayCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Validates Telegram `/start` token format and length constraints. */
export function isPairingTokenFormat(token: string): boolean {
  if (!token || token.length > 64) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(token);
}

/** Validates the manual fallback display-code format. */
export function isPairingDisplayCodeFormat(code: string): boolean {
  return /^[A-Z]{2}-[A-Z0-9]{6}$/.test(normalizePairingDisplayCode(code));
}
