/**
 * Browser-side helpers for auth redirect paths and simple name parsing.
 * @module lib/auth/browser-redirect
 */

export function getSafeNextPath(nextPath?: string | null): string {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/chat";
  }

  return nextPath;
}

export function buildBrowserAuthRedirectUrl(nextPath?: string | null): string {
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  callbackUrl.searchParams.set("next", getSafeNextPath(nextPath));

  return callbackUrl.toString();
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const [firstName = "", ...rest] = normalizedName.split(" ");

  return {
    firstName,
    lastName: rest.join(" "),
  };
}
