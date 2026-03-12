/**
 * Web tool factory barrel for runner registration.
 * @module lib/runner/tools/web
 */
import { createDriveTimeTool } from "./drive-time";
import { createScrapeTool } from "./scrape";
import { createSearchTool } from "./search";

/**
 * Creates all web utility tools for the runner.
 */
export function createWebTools() {
  return {
    ...createDriveTimeTool(),
    ...createSearchTool(),
    ...createScrapeTool(),
  };
}
