/**
 * Guards the shared typography system against regressions.
 *
 * This script blocks:
 * 1. Raw arbitrary `text-[...]` utilities on product surfaces.
 * 2. Inline typography style literals outside approved illustration/chart files.
 * 3. Landing-only layout/button imports leaking back into the product app.
 * 4. Deprecated font imports that bypass the approved font stack.
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

for (const filePath of sourceFiles) {
  const fileContents = readFileSync(filePath, "utf8");

  if (!isAllowlisted(filePath)) {
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
