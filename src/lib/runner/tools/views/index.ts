/**
 * View tool factory barrel.
 * @module lib/runner/tools/views
 */
import { createShowViewTool } from "./show-view";

export function createViewTools() {
  return {
    show_view: createShowViewTool(),
  };
}
