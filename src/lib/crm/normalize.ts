/**
 * CRM data normalisation utilities.
 *
 * Normalisation and save-time validation happen in the application layer before
 * insert/update so the database always receives clean, canonical values. The
 * DB-level CHECK constraint is a secondary safety net for writes that bypass
 * those callers.
 *
 * @module lib/crm/normalize
 */
import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";
import normalizeUrl from "normalize-url";
import psl from "psl";
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
 * Shared result shape for CRM field validators used by both quick-edit UIs and
 * write paths that need a user-facing validation message.
 */
export type CrmSaveValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

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

/** Strips all non-digit characters from a phone-like string. */
export function extractPhoneDigits(input: string): string {
  return input.replace(/[^\d]/g, "");
}

/**
 * Matches a stored E.164 phone number against a raw digit string using suffix matching.
 */
export function phoneMatchesByDigits(e164: string, digits: string): boolean {
  const storedDigits = extractPhoneDigits(e164);
  if (!storedDigits || !digits) {
    return false;
  }

  return storedDigits.endsWith(digits) || digits.endsWith(storedDigits);
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

/**
 * Validates an email before saving to the CRM.
 *
 * - blank input clears the field
 * - non-empty values must pass `z.string().email()`
 * - stored form is trimmed + lowercased
 */
export function validateEmailForSave(
  input: unknown,
): CrmSaveValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }

  if (typeof input !== "string") {
    return { ok: false, message: "Doesn't look like an email" };
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  const lowered = trimmed.toLowerCase();
  const parsed = emailSchema.safeParse(lowered);

  if (!parsed.success) {
    return { ok: false, message: "Doesn't look like an email" };
  }

  return { ok: true, value: lowered };
}

/**
 * Validates a phone number before saving to the CRM.
 *
 * - blank input clears the field
 * - prefer canonical E.164 when the parser can produce one
 * - otherwise accept the trimmed raw value only when it has at least 7 digits
 */
export function validatePhoneForSave(
  input: unknown,
  defaultCountry: CountryCode = "US",
): CrmSaveValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }

  if (typeof input !== "string") {
    return { ok: false, message: "Doesn't look like a phone number" };
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  const normalizedPhone = normalizePhone(trimmed, defaultCountry);

  if (normalizedPhone) {
    return { ok: true, value: normalizedPhone };
  }

  if (extractPhoneDigits(trimmed).length >= 7) {
    return { ok: true, value: trimmed };
  }

  return { ok: false, message: "Doesn't look like a phone number" };
}

/**
 * Validates a website before saving to the CRM.
 *
 * - blank input clears the field
 * - non-empty values must normalize into a canonical URL-ish storage form
 */
export function validateWebsiteForSave(
  input: unknown,
): CrmSaveValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }

  if (typeof input !== "string") {
    return { ok: false, message: "Doesn't look like a website" };
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  const normalizedWebsite = normalizeWebsite(trimmed);

  if (!normalizedWebsite) {
    return { ok: false, message: "Doesn't look like a website" };
  }

  try {
    const parsedUrl = new URL(
      normalizedWebsite.startsWith("http") ? normalizedWebsite : `https://${normalizedWebsite}`,
    );
    if (!parsedUrl.hostname.includes(".")) {
      return { ok: false, message: "Doesn't look like a website" };
    }
  } catch {
    return { ok: false, message: "Doesn't look like a website" };
  }

  return { ok: true, value: normalizedWebsite };
}

/**
 * Extracts the registrable domain from an email address using the Public Suffix List.
 */
export function extractEmailDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const atIndex = input.indexOf("@");
  if (atIndex < 1 || atIndex === input.length - 1) {
    return null;
  }

  const rawDomain = input.slice(atIndex + 1).toLowerCase().trim();
  if (!rawDomain) {
    return null;
  }

  try {
    const parsed = psl.parse(rawDomain);
    return parsed.domain ?? null;
  } catch {
    return null;
  }
}
