/**
 * Guards the shared typography system against regressions.
 *
 * This script blocks:
 * 1. Raw arbitrary `text-[...]` utilities on product surfaces.
 * 2. Page-entry headers bypassing the shared `PageHeader` primitive.
 * 3. Inline typography style literals outside approved illustration/chart files.
 * 4. Landing-only layout/button imports leaking back into the product app.
 * 5. Deprecated font imports that bypass the approved font stack.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowlistedTypographyFiles = [
  /^app\/global-error\.tsx$/,
  /^src\/components\/remotion\//,
  /^src\/components\/landing\/SlimLayout\.tsx$/,
  /^src\/components\/landing\/WhatsAppPhoneMockup\.tsx$/,
  /^src\/components\/landing\/WhatsAppCard\.tsx$/,
  /^src\/components\/landing\/HeroIdentityAnimation\.tsx$/,
  /^src\/components\/views\/chart-panels\.tsx$/,
  /^src\/components\/property\/charts\//,
  /^src\/lib\/property\/chart-colors\.ts$/,
  /^src\/components\/ai-elements\/streamdown-plugins\.ts$/,
];

const semanticTypographyScopeFiles = [
  /^app\/\(dashboard\)\//,
  /^app\/settings\//,
  /^src\/components\/chat\/chat-welcome\.tsx$/,
  /^src\/components\/chat\/chat-thread-header\.tsx$/,
  /^src\/components\/layout\/app-sidebar\.tsx$/,
  /^src\/components\/layout\/all-chats-popover\.tsx$/,
  /^src\/components\/automations\/automation-(detail|header|instructions|runs|schedule-sidebar)\.tsx$/,
  /^src\/components\/meetings\/(meeting-row|meetings-list|meeting-recording-view|summary-view|transcript-section)\.tsx$/,
  /^src\/components\/crm\/(calendar-day-card|calendar-month-day|calendar-top-bar|crm-list-panel-layout|crm-tasks-calendar|crm-tasks-table|deal-kanban-card|kanban-board|quick-edit-cell)\.tsx$/,
  /^src\/components\/ui\/(data-table|drawer|empty-state|filter-bar|filter-overlay|input|sheet|table|tabs)\.tsx$/,
];

const productLayoutScopeFiles = [
  /^app\/\(dashboard\)\//,
  /^app\/settings\//,
  /^src\/components\/automations\//,
  /^src\/components\/crm\//,
  /^src\/components\/layout\//,
  /^src\/components\/meetings\//,
  /^src\/components\/settings\//,
  /^src\/components\/ui\/(data-table|empty-state|filter-bar|sidebar|table)\.tsx$/,
];

const rawTextSizeAllowlist: RegExp[] = [];
const pageHeaderPrimitiveAllowlist = [
  /^src\/components\/layout\/page-header\.tsx$/,
  /^src\/components\/layout\/all-chats-popover\.tsx$/,
  /^src\/components\/command-menu\.tsx$/,
  /^src\/components\/ui\/(drawer|filter-overlay|sheet)\.tsx$/,
  /^app\/\(dashboard\)\/error\.tsx$/,
];

const sourceFiles = execSync("rg --files app src", {
  cwd: process.cwd(),
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath));

const issues: string[] = [];

function isAllowlisted(filePath: string) {
  return allowlistedTypographyFiles.some((pattern) => pattern.test(filePath));
}

function isSemanticTypographyScope(filePath: string) {
  return semanticTypographyScopeFiles.some((pattern) => pattern.test(filePath));
}

function isRawTextSizeAllowlisted(filePath: string) {
  return rawTextSizeAllowlist.some((pattern) => pattern.test(filePath));
}

function isProductLayoutScope(filePath: string) {
  return productLayoutScopeFiles.some((pattern) => pattern.test(filePath));
}

function isPageHeaderPrimitiveAllowlisted(filePath: string) {
  return pageHeaderPrimitiveAllowlist.some((pattern) => pattern.test(filePath));
}

for (const filePath of sourceFiles) {
  const fileContents = readFileSync(filePath, "utf8");

  if (!isAllowlisted(filePath)) {
    if (isSemanticTypographyScope(filePath) && !isRawTextSizeAllowlisted(filePath)) {
      const rawTextSizeMatches =
        fileContents.match(/\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g) ?? [];
      for (const match of rawTextSizeMatches) {
        issues.push(`${filePath}: disallowed raw text size "${match}" in authenticated product typography scope`);
      }
    }

    const shouldUsePageHeaderPrimitive =
      ((/^app\/\(dashboard\)\//.test(filePath) || /^app\/settings\//.test(filePath))
        && /\/page\.tsx$/.test(filePath))
      || /^src\/components\/automations\/automation-header\.tsx$/.test(filePath)
      || /^src\/components\/crm\/crm-list-panel-layout\.tsx$/.test(filePath)
      || /^src\/components\/settings\/settings-stub-page\.tsx$/.test(filePath);

    if (shouldUsePageHeaderPrimitive && !isPageHeaderPrimitiveAllowlisted(filePath)) {
      const directTitleMatches = fileContents.match(/<h1[^>]*\btype-(?:page|toolbar)-title\b/g) ?? [];
      for (const match of directTitleMatches) {
        issues.push(`${filePath}: header typography must go through the shared page-header primitive, found "${match.trim()}"`);
      }

      const directDescriptionMatches =
        fileContents.match(/<p[^>]*\btype-(?:page|toolbar)-description\b/g) ?? [];
      for (const match of directDescriptionMatches) {
        issues.push(`${filePath}: header typography must go through the shared page-header primitive, found "${match.trim()}"`);
      }
    }

    const arbitraryTextMatches = fileContents.match(/text-\[(?:[0-9.]+(?:px|rem|em|vw))\]/g) ?? [];
    for (const match of arbitraryTextMatches) {
      issues.push(`${filePath}: disallowed raw text size "${match}"`);
    }

    const inlineTypographyMatches =
      fileContents.match(/\b(?:fontSize|fontFamily|lineHeight|letterSpacing)\s*:/g) ?? [];
    for (const match of inlineTypographyMatches) {
      issues.push(`${filePath}: disallowed inline typography style "${match.trim()}"`);
    }
  }

  if (isProductLayoutScope(filePath)) {
    const rawColorMatches =
      fileContents.match(/\b(?:bg|text|border)-\[#(?:[0-9a-fA-F]{3,8})\]\b/g) ?? [];
    for (const match of rawColorMatches) {
      issues.push(`${filePath}: disallowed raw product color "${match}"`);
    }

    const arbitraryShadowMatches = fileContents.match(/\bshadow-\[[^\]]+\]/g) ?? [];
    for (const match of arbitraryShadowMatches) {
      issues.push(`${filePath}: disallowed bespoke product shadow "${match}"`);
    }

    if (fileContents.includes("overflow-auto px-4 py-6 md:px-12 md:py-10")) {
      issues.push(`${filePath}: legacy dashboard page wrapper detected; use PageCanvas instead`);
    }
  }

  if (
    !/^src\/components\/landing\//.test(filePath)
    && fileContents.includes('@/components/landing/Button')
  ) {
    issues.push(`${filePath}: landing Button import is restricted to landing components`);
  }

  if (fileContents.includes('@/components/landing/SlimLayout')) {
    issues.push(`${filePath}: SlimLayout is deprecated outside illustration components`);
  }

  if (/\bPlayfair_Display\b/.test(fileContents) || /geist\/font\/sans/.test(fileContents) || /\bGeist\(/.test(fileContents)) {
    issues.push(`${filePath}: deprecated font import or initializer detected`);
  }
}

if (issues.length > 0) {
  console.error("Typography lint failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Typography lint passed.");
