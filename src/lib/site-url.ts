const DEFAULT_SITE_URL = "https://www.trysunder.com";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return DEFAULT_SITE_URL;
  }

  return raw.replace(/\/$/, "");
}
