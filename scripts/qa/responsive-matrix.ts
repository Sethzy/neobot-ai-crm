#!/usr/bin/env npx tsx
/**
 * Responsive route matrix for authenticated app surfaces.
 * @module scripts/qa/responsive-matrix
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const QA_EMAIL = process.env.QA_USER_EMAIL ?? "";
const QA_PASSWORD = process.env.QA_USER_PASSWORD ?? "";
const OUTPUT_DIR = join("scripts", "qa", "output", `responsive-${Date.now()}`);

const viewports = [
  { name: "phone", width: 390, height: 844, enforceTouch: true },
  { name: "tablet", width: 768, height: 1024, enforceTouch: false },
  { name: "desktop", width: 1440, height: 1000, enforceTouch: false },
] as const;

const routes = [
  "/chat",
  "/customers/people",
  "/customers/companies",
  "/customers/deals",
  "/tasks",
  "/automations",
  "/settings/profile",
  "/pricing",
] as const;

interface RouteResult {
  route: string;
  viewport: string;
  finalUrl: string;
  horizontalOverflow: number;
  smallTargets: Array<{ label: string; width: number; height: number }>;
  status: "pass" | "fail";
  screenshot?: string;
}

async function signIn(page: Page) {
  if (!QA_EMAIL || !QA_PASSWORD) {
    throw new Error("Set QA_USER_EMAIL and QA_USER_PASSWORD for responsive QA.");
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/chat")) {
    return;
  }

  await page.getByLabel(/email address/i).fill(QA_EMAIL);
  await page.getByLabel(/^password$/i).fill(QA_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
}

async function auditRoute(
  page: Page,
  route: string,
  viewport: typeof viewports[number],
): Promise<RouteResult> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  const audit = await page.evaluate(`(() => {
    const enforceTouch = ${viewport.enforceTouch ? "true" : "false"};
    const root = document.documentElement;

    const parsePixelValue = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const getEffectiveTargetSize = (element) => {
      const rect = element.getBoundingClientRect();
      const afterStyle = window.getComputedStyle(element, "::after");
      const afterContent = afterStyle.content;

      if (!afterContent || afterContent === "none") {
        return { width: rect.width, height: rect.height };
      }

      const leftInset = Math.max(0, -parsePixelValue(afterStyle.left));
      const rightInset = Math.max(0, -parsePixelValue(afterStyle.right));
      const topInset = Math.max(0, -parsePixelValue(afterStyle.top));
      const bottomInset = Math.max(0, -parsePixelValue(afterStyle.bottom));

      return {
        width: rect.width + leftInset + rightInset,
        height: rect.height + topInset + bottomInset,
      };
    };

    const isInsideClippedScroller = (element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = window.getComputedStyle(ancestor);
        const clipsHorizontalOverflow =
          style.overflowX === "auto" ||
          style.overflowX === "scroll" ||
          style.overflowX === "hidden" ||
          style.overflowX === "clip";

        if (clipsHorizontalOverflow && ancestor.scrollWidth > ancestor.clientWidth) {
          return true;
        }

        ancestor = ancestor.parentElement;
      }

      return false;
    };

    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const ignoredSelectors = [
      "[data-nextjs-toast]",
      "[data-nextjs-dialog]",
      "[data-agentation-root]",
      "[class*='styles-module__']",
      "[aria-hidden='true']",
    ].join(",");

    const horizontalOverflow = Math.ceil(
      Array.from(document.body.querySelectorAll("*")).reduce((maxOverflow, element) => {
        if (element.closest(ignoredSelectors) || !isVisible(element) || isInsideClippedScroller(element)) {
          return maxOverflow;
        }

        const rect = element.getBoundingClientRect();
        return Math.max(maxOverflow, rect.right - root.clientWidth, -rect.left);
      }, 0),
    );
    const interactiveSelectors = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='switch']",
      "[role='tab']",
    ].join(",");

    const smallTargets = enforceTouch
      ? Array.from(document.querySelectorAll(interactiveSelectors))
          .filter((element) => {
            if (element.closest(ignoredSelectors)) return false;
            if (!isVisible(element)) return false;
            const size = getEffectiveTargetSize(element);
            return size.width < 44 || size.height < 44;
          })
          .slice(0, 20)
          .map((element) => {
            const size = getEffectiveTargetSize(element);
            return {
              label:
                element.getAttribute("aria-label")
                || element.textContent?.trim().replace(/\\s+/g, " ").slice(0, 60)
                || element.tagName,
              width: Math.round(size.width),
              height: Math.round(size.height),
            };
          })
      : [];

    return { horizontalOverflow, smallTargets };
  })()`) as Pick<RouteResult, "horizontalOverflow" | "smallTargets">;

  const status = audit.horizontalOverflow > 0 || audit.smallTargets.length > 0 ? "fail" : "pass";
  let screenshot: string | undefined;

  if (status === "fail") {
    screenshot = join(
      OUTPUT_DIR,
      `${viewport.name}-${route.replaceAll("/", "_").replace(/^_/, "") || "root"}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  return {
    route,
    viewport: viewport.name,
    finalUrl: page.url(),
    horizontalOverflow: audit.horizontalOverflow,
    smallTargets: audit.smallTargets,
    status,
    screenshot,
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const results: RouteResult[] = [];

  try {
    await signIn(page);

    for (const viewport of viewports) {
      for (const route of routes) {
        results.push(await auditRoute(page, route, viewport));
      }
    }
  } finally {
    await browser.close();
  }

  const manifestPath = join(OUTPUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(results, null, 2));

  const failures = results.filter((result) => result.status === "fail");

  for (const result of results) {
    const overflow = result.horizontalOverflow > 0 ? ` overflow=${result.horizontalOverflow}` : "";
    const smallTargets =
      result.smallTargets.length > 0 ? ` smallTargets=${result.smallTargets.length}` : "";
    console.log(`${result.status.toUpperCase()} ${result.viewport} ${result.route}${overflow}${smallTargets}`);
  }

  console.log(`Manifest: ${manifestPath}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
