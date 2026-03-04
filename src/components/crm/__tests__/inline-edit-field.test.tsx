/**
 * Tests display/edit/save behavior for the reusable CRM inline field editor.
 * @module components/crm/__tests__/inline-edit-field
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InlineEditField } from "@/components/crm/inline-edit-field";

describe("InlineEditField", () => {
  const onSave = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders label and value in display mode", () => {
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("9234-5678")).toBeInTheDocument();
  });

  it("shows input on click", async () => {
    const user = userEvent.setup();

    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    await user.click(screen.getByText("9234-5678"));

    expect(screen.getByRole("textbox")).toHaveValue("9234-5678");
  });

  it("saves on blur", async () => {
    const user = userEvent.setup();

    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222");
    await user.tab();

    expect(onSave).toHaveBeenCalledWith("9111-2222");
  });

  it("saves on Enter for text input", async () => {
    const user = userEvent.setup();

    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222{Enter}");

    expect(onSave).toHaveBeenCalledWith("9111-2222");
  });

  it("reverts on Escape without saving", async () => {
    const user = userEvent.setup();

    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222");
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("9234-5678")).toBeInTheDocument();
  });

  it("does not save when value is unchanged", async () => {
    const user = userEvent.setup();

    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);

    await user.click(screen.getByText("9234-5678"));
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders select value label for type=select", () => {
    render(
      <InlineEditField
        label="Stage"
        value="offer"
        type="select"
        options={[
          { value: "leads", label: "Leads" },
          { value: "offer", label: "Offer" },
          { value: "lost", label: "Lost" },
        ]}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Offer")).toBeInTheDocument();
  });

  it("renders dash for null value", () => {
    render(<InlineEditField label="Email" value={null} onSave={onSave} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders formatted date value for type=date", () => {
    render(<InlineEditField label="Due Date" value="2026-03-10T00:00:00+08:00" type="date" onSave={onSave} />);

    expect(screen.getByText("10 Mar 2026")).toBeInTheDocument();
  });
});
