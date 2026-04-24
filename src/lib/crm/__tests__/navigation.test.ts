import { describe, expect, it } from "vitest";

import {
  getCrmRecordHref,
  getCrmWorkspaceHref,
  resolveCrmRecordBackHref,
} from "../navigation";

describe("CRM navigation helpers", () => {
  it("encodes the current workspace href into page-mode detail links", () => {
    const href = getCrmRecordHref("deal", "deal-1", {
      returnTo: "/customers/deals?savedView=view-1&view=kanban",
    });

    expect(href).toBe(
      "/customers/deals/deal-1?from=%2Fcustomers%2Fdeals%3FsavedView%3Dview-1%26view%3Dkanban",
    );
  });

  it("builds a workspace href from pathname and query params", () => {
    const href = getCrmWorkspaceHref(
      "/customers/people",
      new URLSearchParams("savedView=view-1&page=2"),
    );

    expect(href).toBe("/customers/people?savedView=view-1&page=2");
  });

  it("drops drawer-only detail state from page-mode return hrefs", () => {
    const href = getCrmRecordHref("contact", "contact-1", {
      returnTo: "/customers/people?savedView=view-1&detail=contact-1&page=2",
    });

    expect(href).toBe(
      "/customers/people/contact-1?from=%2Fcustomers%2Fpeople%3FsavedView%3Dview-1%26page%3D2",
    );
    expect(
      resolveCrmRecordBackHref("contact", "/customers/people?savedView=view-1&detail=contact-1&page=2"),
    ).toBe("/customers/people?savedView=view-1&page=2");
  });

  it("falls back to the collection route when a return href is invalid for that record type", () => {
    expect(resolveCrmRecordBackHref("company", "/customers/deals?savedView=view-1")).toBe(
      "/customers/companies",
    );
  });
});
