/**
 * CRM data normalisation utilities.
 *
 * Normalisation happens at the tool layer (before insert/update) so the database
 * always receives clean, canonical values. The DB-level CHECK constraint is a
 * secondary safety net for any writes that bypass the application layer.
 *
 * @module lib/crm/normalize
 */
import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";
import normalizeUrl from "normalize-url";
import { z } from "zod";

const NORMALIZE_URL_OPTIONS = {
  stripProtocol: true,
  stripHash: true,
  removeQueryParameters: true,
  stripWWW: true,
  removeSingleSlash: true,
} as const;
const emailSchema = z.string().email();

/**
 * Attempts to normalise a phone string to E.164 format (e.g. `+12125551234`).
 *
 * Accepts any common format:
 *   - `(212) 555-1234`          → `+12125551234`  (with defaultCountry "US")
 *   - `+1-212-555-1234`         → `+12125551234`
 *   - `65 9123 4567`            → `+6591234567`   (with defaultCountry "SG")
 *
 * Returns `null` when the input cannot be parsed or is not a valid phone number.
 * Callers should fall back to storing the raw string rather than rejecting outright,
 * unless strict enforcement is desired.
 *
 * @param input           Raw phone string in any format.
 * @param defaultCountry  ISO 3166-1 alpha-2 code assumed when the number lacks a
 *                        country prefix. Defaults to `"US"`.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "US",
): string | null {
  if (!input) return null;
  try {
    const parsed = parsePhoneNumber(input, defaultCountry);
    return parsed.isValid() ? parsed.format("E.164") : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a website URL into a canonical storage form for deduplication.
 *
 * Examples:
 *   - `https://www.acme.com/?utm=x` -> `acme.com`
 *   - `http://acme.com/Products` -> `acme.com/Products`
 *
 * Returns `null` when the input cannot be parsed as a URL.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return normalizeUrl(trimmed, NORMALIZE_URL_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Validates and lowercases an email string for canonical storage.
 *
 * Returns `null` for nullish or blank input and throws for non-empty invalid input.
 */
export function normalizeEmail(
  input: unknown,
  fieldLabel = "email",
): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  const parsed = emailSchema.safeParse(lowered);

  if (!parsed.success) {
    throw new Error(`Invalid ${fieldLabel} format: "${input}"`);
  }

  return lowered;
}
