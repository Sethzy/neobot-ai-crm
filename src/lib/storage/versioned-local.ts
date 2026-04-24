/**
 * Small helpers for versioned localStorage payloads.
 *
 * Values are wrapped in a `{ v, d }` envelope so callers can invalidate old
 * persisted shapes without changing the storage key itself.
 *
 * @module lib/storage/versioned-local
 */

interface VersionedValue<T> {
  v: number;
  d: T;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Reads a versioned JSON payload from localStorage and falls back when the key
 * is absent, malformed, or from a different schema version.
 */
export function readVersionedJSON<T>(
  key: string,
  version: number,
  fallback: T,
): T {
  if (!canUseLocalStorage()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return fallback;
    }

    const parsedValue = JSON.parse(rawValue) as VersionedValue<T>;
    if (
      typeof parsedValue !== "object"
      || parsedValue === null
      || parsedValue.v !== version
      || !("d" in parsedValue)
    ) {
      return fallback;
    }

    return parsedValue.d;
  } catch {
    return fallback;
  }
}

/**
 * Writes a versioned JSON payload to localStorage.
 *
 * Storage quota or privacy-mode failures are ignored because callers should
 * continue working from in-memory state.
 */
export function writeVersionedJSON<T>(
  key: string,
  version: number,
  data: T,
): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    const payload: VersionedValue<T> = { v: version, d: data };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Intentionally ignore storage failures.
  }
}
