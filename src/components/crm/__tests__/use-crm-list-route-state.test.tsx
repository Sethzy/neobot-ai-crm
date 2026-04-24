/**
 * Tests CRM list saved-view route helpers.
 * @module components/crm/__tests__/use-crm-list-route-state
 */
import { describe, expect, it } from "vitest";

import { buildCrmListSavedViewHref } from "@/components/crm/use-crm-list-route-state";

describe("buildCrmListSavedViewHref", () => {
  it("replaces only the savedView param while preserving the rest of the query", () => {
    expect(
      buildCrmListSavedViewHref(
        "/customers/people",
        "view=kanban&savedView=old",
        "new",
      ),
    ).toBe("/customers/people?view=kanban&savedView=new");
  });

  it("removes the savedView param when clearing the active view", () => {
    expect(
      buildCrmListSavedViewHref(
        "/tasks",
        "savedView=old&foo=bar",
        null,
      ),
    ).toBe("/tasks?foo=bar");
  });
});
