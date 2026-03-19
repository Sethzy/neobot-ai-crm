/**
 * Signed browser auth state tokens for verify and cleanup routes.
 * @module lib/browser-use/auth-state
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
const TOKEN_VERSION = 1;

export interface BrowserAuthTokenPayload {
  clientId: string;
  platform: string;
  sessionId: string;
  browserUseProfileId: string;
  issuedAt: number;
  version: number;
}

interface UnsignedBrowserAuthTokenPayload {
  clientId: string;
  platform: string;
  sessionId: string;
  browserUseProfileId: string;
}

function getBrowserAuthSecret(): string {
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (secret.length === 0) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for browser auth state signing.");
  }

  return secret;
}

function encodePayload(payload: BrowserAuthTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload: string): BrowserAuthTokenPayload | null {
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as BrowserAuthTokenPayload;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getBrowserAuthSecret())
    .update(encodedPayload)
    .digest("hex");
}

/**
 * Creates a signed browser auth token scoped to one client, platform, session, and profile.
 */
export function createBrowserAuthToken(
  payload: UnsignedBrowserAuthTokenPayload,
): string {
  const signedPayload: BrowserAuthTokenPayload = {
    ...payload,
    issuedAt: Date.now(),
    version: TOKEN_VERSION,
  };

  const encodedPayload = encodePayload(signedPayload);
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a browser auth token and returns the decoded payload when valid and fresh.
 */
export function verifyBrowserAuthToken(token: string): BrowserAuthTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);

  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = decodePayload(encodedPayload);

  if (!payload || payload.version !== TOKEN_VERSION) {
    return null;
  }

  if (Date.now() - payload.issuedAt > TOKEN_MAX_AGE_MS) {
    return null;
  }

  return payload;
}
