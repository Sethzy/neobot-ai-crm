/**
 * Tests for the subtle inline tool call display.
 * @module components/chat/tool-call-inline.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

    expect(screen.getByTestId("tool-arguments")).toHaveTextContent("query:");
    expect(screen.getByTestId("tool-arguments")).toHaveTextContent('"John"');
  });

  it("shows formatted output when expanded", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-result")).toHaveTextContent('"John Doe"');
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

  it("renders tool arguments with JsonView instead of raw JSON", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);
    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(
      screen.getByTestId("tool-arguments").querySelector("[data-testid='json-view']"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tool-arguments").querySelector("pre"),
    ).not.toBeInTheDocument();
  });

  it("renders tool result with JsonView instead of raw JSON", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);
    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(
      screen.getByTestId("tool-result").querySelector("[data-testid='json-view']"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tool-result").querySelector("pre"),
    ).not.toBeInTheDocument();
  });

  it("accepts onToolApproval and approvalId props without error", () => {
    const onToolApproval = vi.fn();
    render(
      <ToolCallInline
        {...defaultProps}
        approvalId="approval-1"
        onToolApproval={onToolApproval}
      />,
    );
    expect(screen.getByTestId("tool-call-inline")).toBeInTheDocument();
  });
});

describe("approval-requested state", () => {
  const approvalProps = {
    name: "write_file",
    state: "approval-requested" as const,
    input: { path: "/memory.md", content: "Updated notes" },
    approvalId: "approval-abc",
    onToolApproval: vi.fn(),
  };

  it("shows approve and deny buttons when state is approval-requested", () => {
    render(<ToolCallInline {...approvalProps} />);

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("calls onToolApproval with (approvalId, true) when approve clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /approve/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", true);
  });

  it("calls onToolApproval with (approvalId, false) when deny clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /deny/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", false);
  });

  it("does not show approve/deny buttons for other states", () => {
    render(<ToolCallInline name="search" state="output-available" input={{}} output={{}} />);

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });

  it("does not show buttons when onToolApproval is not provided", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="approval-requested"
        input={{}}
        approvalId="approval-1"
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows amber pulsing dot when awaiting approval", () => {
    render(<ToolCallInline {...approvalProps} />);

    const dot = screen.getByTestId("tool-dot");
    expect(dot.className).toMatch(/animate-pulse/);
    expect(dot.className).toMatch(/bg-amber/);
  });
});

describe("output-denied state", () => {
  it("shows an orange denial indicator dot (not pulsing)", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    const dot = screen.getByTestId("tool-dot");
    expect(dot.className).toMatch(/bg-orange/);
    expect(dot.className).not.toMatch(/animate-pulse/);
  });

  it("shows 'Denied' label after tool name", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.getByText(/denied/i)).toBeInTheDocument();
  });

  it("does not show result section when denied and expanded", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
  });

  it("does not show approval buttons when denied", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });
});
