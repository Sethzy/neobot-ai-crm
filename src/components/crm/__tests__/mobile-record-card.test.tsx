/**
 * Tests for CRM mobile record cards.
 * @module components/crm/__tests__/mobile-record-card
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileRecordCard } from "../mobile-record-card";

describe("MobileRecordCard", () => {
  it("opens from card body and isolates action clicks", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    const action = vi.fn();

    render(
      <MobileRecordCard
        title="Sarah Lim"
        meta="Buyer"
        onOpen={open}
        actions={<button type="button" onClick={action}>More</button>}
      />,
    );

    await user.click(screen.getByText("Sarah Lim"));
    await user.click(screen.getByRole("button", { name: "More" }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
