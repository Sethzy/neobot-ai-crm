# Shared Utilities

## CRM Filter Utilities

Source: `src/lib/runner/tools/crm/filter-utils.ts`

```typescript
/**
 * Utilities for building safe PostgREST filter expressions.
 * @module lib/runner/tools/crm/filter-utils
 */

/**
 * Normalizes free-form user search text to a compact single-line value.
 */
function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Escapes LIKE wildcard characters so user input is treated as literal text.
 */
function escapeLikeWildcards(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Returns a quoted PostgREST literal for a case-insensitive contains search.
 */
export function buildContainsIlikeLiteral(searchText: string): string {
  const normalizedText = normalizeSearchText(searchText);
  const escapedText = escapeLikeWildcards(normalizedText);

  // PostgREST accepts quoted filter values; JSON stringification provides robust escaping.
  return JSON.stringify(`%${escapedText}%`);
}
```

## Web Fetch Timeout Helper

Source: `src/lib/runner/tools/web/fetch-with-timeout.ts`

```typescript
/**
 * Shared fetch timeout helper for web utility tools.
 * @module lib/runner/tools/web/fetch-with-timeout
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Executes fetch with an AbortController timeout.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
```

## CRM Zod Enums (used by tool input schemas)

Source: `src/lib/crm/schemas.ts`

```typescript
export const contactTypeValues = [
  "buyer", "seller", "landlord", "tenant", "agent", "other",
] as const;

export const dealStageValues = [
  "leads", "viewing", "offer", "negotiation", "otp", "completion", "lost",
] as const;

export const interactionTypeValues = [
  "call", "meeting", "email", "message", "viewing", "note",
] as const;

export const crmTaskStatusValues = ["open", "completed"] as const;
```
