/**
 * Tests for Tool UI components — ToolInput and ToolOutput rendering.
 * @module components/ai-elements/__tests__/tool.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolInput, ToolOutput } from "../tool";

describe("ToolInput", () => {
  it("renders input data with JsonView", () => {
    render(<ToolInput input={{ query: "test" }} />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
    expect(screen.getByText("query:")).toBeInTheDocument();
  });

  it("does not use CodeBlock for JSON data", () => {
    const { container } = render(<ToolInput input={{ key: "value" }} />);
    expect(container.querySelector("[data-language]")).not.toBeInTheDocument();
  });
});

describe("ToolOutput", () => {
  it("renders object output with JsonView", () => {
    render(<ToolOutput output={{ success: true }} errorText="" />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("renders string output with JsonView", () => {
    render(<ToolOutput output="plain text result" errorText="" />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
    expect(screen.getByText('"plain text result"')).toBeInTheDocument();
  });

  it("renders error text when present", () => {
    render(<ToolOutput output={undefined} errorText="Connection failed" />);
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("returns null when no output and no error", () => {
    const { container } = render(
      <ToolOutput output={undefined} errorText="" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
