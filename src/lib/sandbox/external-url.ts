/**
 * Guards runner-side downloads against localhost and private-network URLs.
 * @module lib/sandbox/external-url
 */
import * as dns from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

/**
 * Parses a URL and rejects localhost/private-network targets.
 */
export function assertSafeExternalUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const hostname = normalizeHostname(url.hostname);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked private or unsafe URL "${rawUrl}".`);
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname)
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || isPrivateIpAddress(hostname)
  ) {
    throw new Error(`Blocked private or unsafe URL "${rawUrl}".`);
  }

  return url;
}

/**
 * Fetches a public external resource after validating its resolved destination.
 */
export async function fetchSafeExternalResource(rawUrl: string): Promise<Response> {
  const url = assertSafeExternalUrl(rawUrl);
  const hostname = normalizeHostname(url.hostname);

  if (!isPrivateIpAddress(hostname) && isIP(hostname) === 0) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });

    if (records.length === 0 || records.some((record) => isPrivateIpAddress(record.address))) {
      throw new Error(`Blocked private or unsafe URL "${rawUrl}".`);
    }
  }

  return fetch(url.toString(), { redirect: "error" });
}

function isPrivateIpAddress(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  const ipVersion = isIP(normalizedHostname);

  if (ipVersion === 4) {
    return isPrivateIpv4(normalizedHostname);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(normalizedHostname);
  }

  return false;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((value) => Number(value));

  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return false;
  }

  const [first, second] = octets;

  return first === 10
    || first === 127
    || first === 0
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const mappedIpv4 = normalizeMappedIpv4(normalized);

  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }

  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb");
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function normalizeMappedIpv4(hostname: string): string | null {
  if (!hostname.startsWith("::ffff:")) {
    return null;
  }

  const tail = hostname.slice("::ffff:".length);

  if (tail.includes(".")) {
    return tail;
  }

  const segments = tail.split(":");

  if (segments.length !== 2) {
    return null;
  }

  const first = Number.parseInt(segments[0], 16);
  const second = Number.parseInt(segments[1], 16);

  if (Number.isNaN(first) || Number.isNaN(second)) {
    return null;
  }

  return `${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`;
}
