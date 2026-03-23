/**
 * Guards runner-side downloads against localhost and private-network URLs.
 * @module lib/sandbox/external-url
 */
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

/**
 * Parses a URL and rejects localhost/private-network targets.
 */
export function assertSafeExternalUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked private or unsafe URL "${rawUrl}".`);
  }

  const hostname = url.hostname.toLowerCase();

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

function isPrivateIpAddress(hostname: string): boolean {
  const ipVersion = isIP(hostname);

  if (ipVersion === 4) {
    return isPrivateIpv4(hostname);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(hostname);
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
  const normalized = hostname.toLowerCase();

  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb");
}
