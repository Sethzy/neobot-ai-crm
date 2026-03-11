/**
 * Tests dense CRM quick-edit cell behavior for list and board surfaces.
 * @module components/crm/__tests__/quick-edit-cell
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { useIsMobile } from "@/hooks/use-mobile";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

describe("QuickEditCell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("saves a text value on Enter without triggering row navigation", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <div onClick={onNavigate}>
        <QuickEditCell ariaLabel="Phone" value="91234567" onSave={onSave} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "90000000{Enter}");

    expect(onSave).toHaveBeenCalledWith("90000000");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("restores the original value on Escape without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<QuickEditCell ariaLabel="Phone" value="91234567" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "90000000");
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("91234567")).toBeInTheDocument();
  });

  it("shows a visible error and keeps editing when save fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Request failed"));

    render(<QuickEditCell ariaLabel="Phone" value="91234567" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "90000000{Enter}");

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /phone/i })).toBeInTheDocument();
  });

  it("shows a parse error and does not save invalid numeric input", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickEditCell
        ariaLabel="Price"
        value={1850000}
        type="number"
        parseValue={() => ({ ok: false, message: "Enter a valid number" })}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit price/i }));
    await user.clear(screen.getByRole("spinbutton", { name: /price/i }));
    await user.type(screen.getByRole("spinbutton", { name: /price/i }), "abc{Enter}");

    expect(await screen.findByText("Enter a valid number")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("opens a one-field mobile dialog when useIsMobile returns true", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const user = userEvent.setup();

    render(<QuickEditCell ariaLabel="Phone" value="91234567" onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit phone/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save phone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("can render only the edit trigger when the parent owns the read-mode display", () => {
    render(
      <QuickEditCell
        ariaLabel="Email"
        value="sarah@example.com"
        hideDisplayValue
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("sarah@example.com")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit email/i })).toBeInTheDocument();
  });

  it("lets desktop select editors cancel without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickEditCell
        ariaLabel="Status"
        value="open"
        type="select"
        options={[
          { value: "open", label: "Open" },
          { value: "completed", label: "Completed" },
        ]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit status/i }));
    expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
