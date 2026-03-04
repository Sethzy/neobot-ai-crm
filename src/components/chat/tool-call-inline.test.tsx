/**
 * Tests for the subtle inline tool call display.
 * @module components/chat/tool-call-inline.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToolCallInline } from "./tool-call-inline";

describe("ToolCallInline", () => {
  const defaultProps = {
    name: "search_contacts",
    state: "output-available" as const,
    input: { query: "John" },
    output: { results: [{ name: "John Doe" }] },
  };

  it("renders as subtle muted text with no bg fill", () => {
    render(<ToolCallInline {...defaultProps} />);

    const trigger = screen.getByTestId("tool-expand-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toMatch(/text-xs/);
    expect(trigger.className).toMatch(/text-muted-foreground/);
    expect(trigger.className).not.toMatch(/bg-muted/);
    expect(trigger.className).not.toMatch(/rounded-lg/);
    expect(screen.getByText("search_contacts")).toBeInTheDocument();
  });

  it("shows a bullet dot indicator", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.getByTestId("tool-dot")).toBeInTheDocument();
  });

  it("shows chevron inline next to name", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.getByTestId("tool-chevron")).toHaveTextContent("›");
  });

  it("does not show input/output when collapsed", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.queryByTestId("tool-details")).not.toBeInTheDocument();
  });

  it("expands to show input and output on click", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-details")).toBeInTheDocument();
    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.getByTestId("tool-result")).toBeInTheDocument();
  });

  it("shows formatted input arguments when expanded", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-arguments")).toHaveTextContent('"query": "John"');
  });

  it("shows formatted output when expanded", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-result")).toHaveTextContent("John Doe");
  });

  it("shows error text instead of result when errorText is provided", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="search_contacts"
        state="output-error"
        input={{ query: "John" }}
        errorText="Connection timeout"
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    expect(screen.queryByText(/Result/i)).not.toBeInTheDocument();
  });

  it("shows pulsing dot when state is input-available (running)", () => {
    render(
      <ToolCallInline
        name="search_contacts"
        state="input-available"
        input={{ query: "John" }}
      />,
    );

    expect(screen.getByTestId("tool-dot").className).toMatch(/animate-pulse/);
  });

  it("does not show expand trigger when no output yet", () => {
    render(
      <ToolCallInline
        name="search_contacts"
        state="input-available"
        input={{ query: "John" }}
      />,
    );

    // Still shows the trigger (for viewing args), but it's there
    expect(screen.getByTestId("tool-expand-trigger")).toBeInTheDocument();
  });
});
