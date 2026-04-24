/**
 * Tests the reusable CRM record-link cell.
 * @module components/crm/__tests__/record-link-cell
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecordLinkCell } from "@/components/crm/record-link-cell";

describe("RecordLinkCell", () => {
  it("renders the primary label and opens the record when clicked", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(<RecordLinkCell label="Ada Lovelace" onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("open-record-hint")).toBeInTheDocument();
  });
});
