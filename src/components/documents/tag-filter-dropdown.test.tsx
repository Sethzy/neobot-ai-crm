/**
 * Tests for tag filter dropdown.
 * @module components/documents/tag-filter-dropdown.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagFilterDropdown } from "./tag-filter-dropdown";

const mockTags = ["invoices", "medical", "legal"];

describe("TagFilterDropdown", () => {
  it("renders All Tags button when no filter selected", () => {
    render(
      <TagFilterDropdown
        availableTags={mockTags}
        selectedTag={null}
        onTagSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /all tags/i })
    ).toBeInTheDocument();
  });

  it("shows selected tag name when filter active", () => {
    render(
      <TagFilterDropdown
        availableTags={mockTags}
        selectedTag="medical"
        onTagSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /medical/i })).toBeInTheDocument();
  });

  it("shows all tags plus All Tags option when opened", async () => {
    const user = userEvent.setup();
    render(
      <TagFilterDropdown
        availableTags={mockTags}
        selectedTag={null}
        onTagSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      // "All Tags" appears in button AND menu item
      expect(screen.getAllByText("All Tags")).toHaveLength(2);
    });
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Medical")).toBeInTheDocument();
    expect(screen.getByText("Legal")).toBeInTheDocument();
  });

  it("calls onTagSelect with tag when selected", async () => {
    const user = userEvent.setup();
    const onTagSelect = vi.fn();
    render(
      <TagFilterDropdown
        availableTags={mockTags}
        selectedTag={null}
        onTagSelect={onTagSelect}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Medical")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Medical"));

    expect(onTagSelect).toHaveBeenCalledWith("medical");
  });

  it("calls onTagSelect with null when All Tags selected", async () => {
    const user = userEvent.setup();
    const onTagSelect = vi.fn();
    render(
      <TagFilterDropdown
        availableTags={mockTags}
        selectedTag="medical"
        onTagSelect={onTagSelect}
      />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /all tags/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("menuitem", { name: /all tags/i }));

    expect(onTagSelect).toHaveBeenCalledWith(null);
  });
});
