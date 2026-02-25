/**
 * @file ArrayFieldEditor tests
 * @description Tests for array field table editing component
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrayFieldEditor } from "./array-field-editor";

describe("ArrayFieldEditor - table rendering", () => {
  const defaultProps = {
    fieldName: "injuries",
    value: [
      { severity: "mild", description: "back pain" },
      { severity: "moderate", description: "neck strain" },
    ],
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table with correct column headers from data keys", () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("severity")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
  });

  it("renders data rows with cell values", () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    expect(screen.getByText("mild")).toBeInTheDocument();
    expect(screen.getByText("back pain")).toBeInTheDocument();
    expect(screen.getByText("moderate")).toBeInTheDocument();
    expect(screen.getByText("neck strain")).toBeInTheDocument();
  });

  it("renders row numbers starting at 1", () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("displays row count in footer", () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    expect(screen.getByText("2 rows")).toBeInTheDocument();
  });
});

describe("ArrayFieldEditor - null/empty state", () => {
  it("renders null state with 'Value is NULL' when value is null", () => {
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={null}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Value is NULL")).toBeInTheDocument();
  });

  it("renders null state when value is empty array", () => {
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[]}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Value is NULL")).toBeInTheDocument();
  });
});

describe("ArrayFieldEditor - cell editing", () => {
  const mockOnChange = vi.fn();
  const defaultProps = {
    fieldName: "injuries",
    value: [{ severity: "mild", description: "back pain" }],
    onChange: mockOnChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows input when cell is clicked", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    const cell = screen.getByText("mild");
    await user.click(cell);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("mild")).toBeInTheDocument();
  });

  it("calls onChange with updated array on blur", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    const cell = screen.getByText("mild");
    await user.click(cell);

    const input = screen.getByRole("textbox");
    await user.type(input, "-ish");
    await user.tab(); // blur

    expect(mockOnChange).toHaveBeenCalledWith([
      { severity: "mild-ish", description: "back pain" },
    ]);
  });

  it("renders a textarea for editing (supports multiline)", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    await user.click(screen.getByText("mild"));

    const textbox = screen.getByRole("textbox");
    expect(textbox.tagName).toBe("TEXTAREA");
  });

  it("saves and exits edit mode on Cmd+Enter", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    await user.click(screen.getByText("mild"));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "-ish");
    // Cmd+Enter to save
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockOnChange).toHaveBeenCalledWith([
      { severity: "mild-ish", description: "back pain" },
    ]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cancels edit on Escape key without saving", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    await user.click(screen.getByText("mild"));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "-ish");
    await user.keyboard("{Escape}");

    // Should exit edit mode without calling onChange
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mockOnChange).not.toHaveBeenCalled();
  });
});

describe("ArrayFieldEditor - disabled state", () => {
  const defaultProps = {
    fieldName: "injuries",
    value: [{ severity: "mild", description: "back pain" }],
    onChange: vi.fn(),
    disabled: true,
  };

  it("does not enter edit mode when disabled", async () => {
    const user = userEvent.setup();
    render(<ArrayFieldEditor {...defaultProps} />);

    await user.click(screen.getByText("mild"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("ArrayFieldEditor - row hover and metadata", () => {
  const mockOnRowHover = vi.fn();
  const citations = [{ page: 1, referenceText: "test", polygon: [{ x: 0, y: 0 }] }];

  const defaultProps = {
    fieldName: "injuries",
    value: [{ severity: "mild", description: "back pain" }],
    onChange: vi.fn(),
    metadata: {
      "injuries[0]": { citations, ocrConfidence: 0.95 },
    },
    onRowHover: mockOnRowHover,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onRowHover with citations on row mouseenter", async () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    const row = screen.getByText("mild").closest("tr")!;
    fireEvent.mouseEnter(row);

    expect(mockOnRowHover).toHaveBeenCalledWith(citations);
  });

  it("calls onRowHover with empty array on row mouseleave", async () => {
    render(<ArrayFieldEditor {...defaultProps} />);

    const row = screen.getByText("mild").closest("tr")!;
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);

    expect(mockOnRowHover).toHaveBeenLastCalledWith([]);
  });

  it("does NOT show per-row confidence badges (moved to aggregate in footer)", () => {
    const lowConfidenceProps = {
      ...defaultProps,
      metadata: {
        "injuries[0]": { citations: [], ocrConfidence: 0.68 },
      },
    };
    render(<ArrayFieldEditor {...lowConfidenceProps} />);

    // Should NOT show per-row confidence values
    expect(screen.queryByText("0.680")).not.toBeInTheDocument();
  });

  it("shows aggregate low confidence count in footer", () => {
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[
          { severity: "mild", description: "back pain" },
          { severity: "moderate", description: "neck strain" },
          { severity: "severe", description: "fracture" },
        ]}
        metadata={{
          "injuries[0]": { citations: [], ocrConfidence: 0.65 },
          "injuries[1]": { citations: [], ocrConfidence: 0.70 },
          "injuries[2]": { citations: [], ocrConfidence: 0.95 },
        }}
      />
    );

    expect(screen.getByText("2 low conf")).toBeInTheDocument();
  });

  it("does not show low conf badge when all rows are high confidence", () => {
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[
          { severity: "mild", description: "back pain" },
          { severity: "moderate", description: "neck strain" },
        ]}
        metadata={{
          "injuries[0]": { citations: [], ocrConfidence: 0.95 },
          "injuries[1]": { citations: [], ocrConfidence: 0.90 },
        }}
      />
    );

    expect(screen.queryByText(/low conf/)).not.toBeInTheDocument();
  });
});

describe("ArrayFieldEditor - filter toggle", () => {
  it("filters to low confidence rows when badge is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[
          { severity: "mild", description: "Item 1" },
          { severity: "moderate", description: "Item 2" },
          { severity: "severe", description: "Item 3" },
        ]}
        metadata={{
          "injuries[0]": { citations: [], ocrConfidence: 0.65 },
          "injuries[1]": { citations: [], ocrConfidence: 0.95 },
          "injuries[2]": { citations: [], ocrConfidence: 0.70 },
        }}
      />
    );

    // Initially shows all 3 rows
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();

    // Click filter badge
    await user.click(screen.getByText("2 low conf"));

    // Now only shows low confidence rows
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.queryByText("Item 2")).not.toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("shows all rows when filter is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[
          { severity: "mild", description: "Item 1" },
          { severity: "moderate", description: "Item 2" },
          { severity: "severe", description: "Item 3" },
        ]}
        metadata={{
          "injuries[0]": { citations: [], ocrConfidence: 0.65 },
          "injuries[1]": { citations: [], ocrConfidence: 0.95 },
          "injuries[2]": { citations: [], ocrConfidence: 0.70 },
        }}
      />
    );

    // Click to filter
    await user.click(screen.getByText("2 low conf"));
    // Click to show all
    await user.click(screen.getByText("Show all"));

    // All rows visible again
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("preserves original row numbers when filtered", async () => {
    const user = userEvent.setup();
    render(
      <ArrayFieldEditor
        fieldName="injuries"
        value={[
          { severity: "mild", description: "Item 1" },
          { severity: "moderate", description: "Item 2" },
          { severity: "severe", description: "Item 3" },
        ]}
        metadata={{
          "injuries[0]": { citations: [], ocrConfidence: 0.65 },
          "injuries[1]": { citations: [], ocrConfidence: 0.95 },
          "injuries[2]": { citations: [], ocrConfidence: 0.70 },
        }}
      />
    );

    await user.click(screen.getByText("2 low conf"));

    // Row numbers should be 1 and 3 (original indices), not 1 and 2
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1");
    expect(rows[1]).toHaveTextContent("Item 1");
    expect(rows[2]).toHaveTextContent("3");
    expect(rows[2]).toHaveTextContent("Item 3");
  });
});
