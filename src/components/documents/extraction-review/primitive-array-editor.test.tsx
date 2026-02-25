/**
 * @file PrimitiveArrayEditor tests
 * @description Tests for primitive array (string/number/boolean) table rendering
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrimitiveArrayEditor } from "./primitive-array-editor";

describe("PrimitiveArrayEditor - string array rendering", () => {
  it("renders table with Value column header", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["Finding one", "Finding two"]}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders full string values in rows (not split into characters)", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["There is mild patchy marrow oedema", "The cruciate ligaments are intact"]}
      />
    );

    expect(screen.getByText("There is mild patchy marrow oedema")).toBeInTheDocument();
    expect(screen.getByText("The cruciate ligaments are intact")).toBeInTheDocument();
  });

  it("renders row numbers starting at 1", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["First", "Second", "Third"]}
      />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays row count in footer", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["A", "B", "C", "D"]}
      />
    );

    expect(screen.getByText("4 rows")).toBeInTheDocument();
  });
});

describe("PrimitiveArrayEditor - null/empty state", () => {
  it("renders null state when value is null", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={null}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Value is NULL")).toBeInTheDocument();
  });

  it("renders null state when value is empty array", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={[]}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Value is NULL")).toBeInTheDocument();
  });
});

describe("PrimitiveArrayEditor - number array rendering", () => {
  it("renders numbers as string values", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="scores"
        value={[95, 87, 72]}
      />
    );

    expect(screen.getByText("95")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });
});

describe("PrimitiveArrayEditor - boolean array rendering", () => {
  it("renders booleans as Yes/No", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="flags"
        value={[true, false, true]}
      />
    );

    expect(screen.getAllByText("Yes")).toHaveLength(2);
    expect(screen.getByText("No")).toBeInTheDocument();
  });
});

describe("PrimitiveArrayEditor - row hover and metadata", () => {
  const mockOnRowHover = vi.fn();
  const citations = [{ page: 1, referenceText: "test", polygon: [{ x: 0, y: 0 }] }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onRowHover with citations on row mouseenter", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["Finding one"]}
        metadata={{
          "findings[0]": { citations, ocrConfidence: 0.95 },
        }}
        onRowHover={mockOnRowHover}
      />
    );

    const row = screen.getByText("Finding one").closest("tr")!;
    fireEvent.mouseEnter(row);

    expect(mockOnRowHover).toHaveBeenCalledWith(citations);
  });

  it("calls onRowHover with empty array on row mouseleave", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["Finding one"]}
        metadata={{
          "findings[0]": { citations, ocrConfidence: 0.95 },
        }}
        onRowHover={mockOnRowHover}
      />
    );

    const row = screen.getByText("Finding one").closest("tr")!;
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);

    expect(mockOnRowHover).toHaveBeenLastCalledWith([]);
  });

  it("does NOT show per-row confidence badges (moved to aggregate in footer)", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="findings"
        value={["Finding one", "Finding two"]}
        metadata={{
          "findings[0]": { citations: [], ocrConfidence: 0.68 },
          "findings[1]": { citations: [], ocrConfidence: 0.95 },
        }}
      />
    );

    // Should NOT show per-row confidence values
    expect(screen.queryByText("0.680")).not.toBeInTheDocument();
  });

  it("shows aggregate low confidence count in footer", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="items"
        value={["Item 1", "Item 2", "Item 3"]}
        metadata={{
          "items[0]": { citations: [], ocrConfidence: 0.65 },
          "items[1]": { citations: [], ocrConfidence: 0.70 },
          "items[2]": { citations: [], ocrConfidence: 0.95 },
        }}
      />
    );

    // Footer should show aggregate count of low confidence items
    expect(screen.getByText("2 low conf")).toBeInTheDocument();
  });

  it("does not show low conf badge when all rows are high confidence", () => {
    render(
      <PrimitiveArrayEditor
        fieldName="items"
        value={["Item 1", "Item 2"]}
        metadata={{
          "items[0]": { citations: [], ocrConfidence: 0.95 },
          "items[1]": { citations: [], ocrConfidence: 0.90 },
        }}
      />
    );

    expect(screen.queryByText(/low conf/)).not.toBeInTheDocument();
  });
});

describe("PrimitiveArrayEditor - filter toggle", () => {
  it("filters to low confidence rows when badge is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <PrimitiveArrayEditor
        fieldName="items"
        value={["Item 1", "Item 2", "Item 3"]}
        metadata={{
          "items[0]": { citations: [], ocrConfidence: 0.65 },
          "items[1]": { citations: [], ocrConfidence: 0.95 },
          "items[2]": { citations: [], ocrConfidence: 0.70 },
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
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <PrimitiveArrayEditor
        fieldName="items"
        value={["Item 1", "Item 2", "Item 3"]}
        metadata={{
          "items[0]": { citations: [], ocrConfidence: 0.65 },
          "items[1]": { citations: [], ocrConfidence: 0.95 },
          "items[2]": { citations: [], ocrConfidence: 0.70 },
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
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <PrimitiveArrayEditor
        fieldName="items"
        value={["Item 1", "Item 2", "Item 3"]}
        metadata={{
          "items[0]": { citations: [], ocrConfidence: 0.65 },
          "items[1]": { citations: [], ocrConfidence: 0.95 },
          "items[2]": { citations: [], ocrConfidence: 0.70 },
        }}
      />
    );

    await user.click(screen.getByText("2 low conf"));

    // Row numbers should be 1 and 3 (original indices), not 1 and 2
    const rows = screen.getAllByRole("row");
    // rows[0] is header, rows[1] is Item 1 (idx 0 -> display 1), rows[2] is Item 3 (idx 2 -> display 3)
    expect(rows[1]).toHaveTextContent("1");
    expect(rows[1]).toHaveTextContent("Item 1");
    expect(rows[2]).toHaveTextContent("3");
    expect(rows[2]).toHaveTextContent("Item 3");
  });
});
