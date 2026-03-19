/**
 * Browser automation tool factory barrel for runner registration.
 * @module lib/runner/tools/browser
 */
import { createBrowseWebsiteTool } from "./browse-website";

/**
 * Creates the Browser-Use powered browser automation tools.
 */
export function createBrowserTools() {
  return {
    ...createBrowseWebsiteTool(),
  };
}
