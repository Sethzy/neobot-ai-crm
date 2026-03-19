/**
 * Bundle-safe filesystem paths for bundled skill markdown assets.
 * @module lib/runner/skills/bundled-skill-files
 */
import { join } from "path";
import { fileURLToPath } from "url";

export const DEFAULT_SKILL_SLUGS = [
  "call-prep",
  "daily-briefing",
  "draft-outreach",
  "pipeline-review",
  "listing-analysis",
  "call-summary",
  "market-briefing",
] as const;

export type DefaultSkillSlug = (typeof DEFAULT_SKILL_SLUGS)[number];

const DEFAULT_SKILL_URLS: Record<DefaultSkillSlug, URL> = {
  "call-prep": new URL("./defaults/call-prep/SKILL.md", import.meta.url),
  "daily-briefing": new URL("./defaults/daily-briefing/SKILL.md", import.meta.url),
  "draft-outreach": new URL("./defaults/draft-outreach/SKILL.md", import.meta.url),
  "pipeline-review": new URL("./defaults/pipeline-review/SKILL.md", import.meta.url),
  "listing-analysis": new URL("./defaults/listing-analysis/SKILL.md", import.meta.url),
  "call-summary": new URL("./defaults/call-summary/SKILL.md", import.meta.url),
  "market-briefing": new URL("./defaults/market-briefing/SKILL.md", import.meta.url),
};

const SYSTEM_SKILL_URLS = {
  "creating-connections/SKILL.md": new URL(
    "./system/creating-connections/SKILL.md",
    import.meta.url,
  ),
  "creating-connections/create-direct-api-connection.md": new URL(
    "./system/creating-connections/create-direct-api-connection.md",
    import.meta.url,
  ),
} as const;

type BundledSystemSkillPath = keyof typeof SYSTEM_SKILL_URLS;

function toBundledFilePath(fileUrl: URL): string {
  if (fileUrl.protocol === "file:") {
    return fileURLToPath(fileUrl);
  }

  const pathname = decodeURIComponent(fileUrl.pathname);

  return pathname.startsWith("/src/")
    ? join(process.cwd(), pathname.slice(1))
    : pathname;
}

export function getBundledDefaultSkillPath(slug: DefaultSkillSlug): string {
  return toBundledFilePath(DEFAULT_SKILL_URLS[slug]);
}

export function getBundledSystemSkillPath(relativePath: string): string | null {
  const fileUrl = SYSTEM_SKILL_URLS[relativePath as BundledSystemSkillPath];

  return fileUrl ? toBundledFilePath(fileUrl) : null;
}
