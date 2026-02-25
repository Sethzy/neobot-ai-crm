/**
 * @file EditableField component tests
 * @description Tests for editable input fields with auto-save on blur
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditableField } from "./editable-field";

describe("EditableField", () => {
  const mockOnChange = vi.fn();

  const defaultProps = {
    fieldName: "patient_name",
    value: "John Doe",
    fieldType: "string" as const,
    onChange: mockOnChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text input for string type", () => {
    render(<EditableField {...defaultProps} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("John Doe");
  });

  it("renders number input for number type", () => {
    render(<EditableField {...defaultProps} fieldType="number" value={1234.56} />);

    const input = screen.getByRole("spinbutton");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(1234.56);
  });

  it("renders date input for date type", () => {
    render(<EditableField {...defaultProps} fieldType="date" value="2024-01-15" />);

    const input = screen.getByDisplayValue("2024-01-15");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "date");
  });

  it("renders checkbox for boolean type", () => {
    render(<EditableField {...defaultProps} fieldType="boolean" value={true} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it("calls onChange on blur when value changed", async () => {
    const user = userEvent.setup();
    render(<EditableField {...defaultProps} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Jane Doe");
    await user.tab(); // Trigger blur

    expect(mockOnChange).toHaveBeenCalledWith("patient_name", "Jane Doe");
  });

  it("does not call onChange on blur when value unchanged", async () => {
    const user = userEvent.setup();
    render(<EditableField {...defaultProps} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.tab(); // Trigger blur without changing

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("renders enabled input (fields are always editable)", () => {
    render(<EditableField {...defaultProps} />);

    expect(screen.getByRole("textbox")).not.toBeDisabled();
  });

  it("handles null value gracefully", () => {
    render(<EditableField {...defaultProps} value={null} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("");
  });
});
