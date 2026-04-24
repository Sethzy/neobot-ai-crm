/**
 * Tests the shared CRM record-detail skeleton.
 * @module components/crm/__tests__/crm-record-detail-skeleton
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrmRecordDetailSkeleton } from "@/components/crm/crm-record-detail-skeleton";

describe("CrmRecordDetailSkeleton", () => {
  it("renders a shared tab rail and six field rows", () => {
    render(<CrmRecordDetailSkeleton tabCount={6} />);

    expect(screen.getAllByTestId("crm-detail-tab-skeleton")).toHaveLength(6);
    expect(screen.getAllByTestId("crm-detail-field-skeleton")).toHaveLength(6);
  });
});
