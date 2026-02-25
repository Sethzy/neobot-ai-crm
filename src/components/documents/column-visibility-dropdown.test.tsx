/**
 * Tests for column visibility dropdown.
 * @module components/documents/column-visibility-dropdown.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnVisibilityDropdown } from "./column-visibility-dropdown";

const mockColumns = [
  { id: "filename", label: "Filename" },
  { id: "tags", label: "Tags" },
  { id: "status", label: "Status" },
];

describe("ColumnVisibilityDropdown", () => {
  it("renders Display button", () => {
    render(
      <ColumnVisibilityDropdown
        columns={mockColumns}
        visibility={{}}
        onVisibilityChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /display/i })).toBeInTheDocument();
  });

  it("shows column checkboxes when opened", async () => {
    const user = userEvent.setup();
    render(
      <ColumnVisibilityDropdown
        columns={mockColumns}
        visibility={{}}
        onVisibilityChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /display/i }));

    await waitFor(() => {
      expect(screen.getByText("Filename")).toBeInTheDocument();
    });
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("shows checked state for visible columns", async () => {
    const user = userEvent.setup();
    render(
      <ColumnVisibilityDropdown
        columns={mockColumns}
        visibility={{ filename: true, tags: false }}
        onVisibilityChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /display/i }));

    await waitFor(() => {
      const filenameCheckbox = screen.getByRole("menuitemcheckbox", {
        name: /filename/i,
      });
      expect(filenameCheckbox).toHaveAttribute("aria-checked", "true");
    });

    const tagsCheckbox = screen.getByRole("menuitemcheckbox", { name: /tags/i });
    expect(tagsCheckbox).toHaveAttribute("aria-checked", "false");
  });

  it("calls onVisibilityChange when checkbox toggled", async () => {
    const user = userEvent.setup();
    const onVisibilityChange = vi.fn();
    render(
      <ColumnVisibilityDropdown
        columns={mockColumns}
        visibility={{ filename: true, tags: true }}
        onVisibilityChange={onVisibilityChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /display/i }));

    await waitFor(() => {
      expect(screen.getByRole("menuitemcheckbox", { name: /tags/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("menuitemcheckbox", { name: /tags/i }));

    expect(onVisibilityChange).toHaveBeenCalledWith({
      filename: true,
      tags: false,
    });
  });
});
