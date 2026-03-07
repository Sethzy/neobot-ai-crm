/**
 * Tests for the lightweight JSON viewer component.
 * @module components/ui/__tests__/json-view.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonView } from "../json-view";

describe("JsonView", () => {
  it("renders string primitives with quotes", () => {
    render(<JsonView data="hello" />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it("renders number primitives", () => {
    render(<JsonView data={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders boolean primitives", () => {
    render(<JsonView data={true} />);
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("renders null", () => {
    render(<JsonView data={null} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders object keys and values", () => {
    render(<JsonView data={{ name: "John", age: 30 }} />);
    expect(screen.getByText("name:")).toBeInTheDocument();
    expect(screen.getByText('"John"')).toBeInTheDocument();
    expect(screen.getByText("age:")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders array items", () => {
    render(<JsonView data={["a", "b", "c"]} />);
    expect(screen.getByText('"a"')).toBeInTheDocument();
    expect(screen.getByText('"b"')).toBeInTheDocument();
    expect(screen.getByText('"c"')).toBeInTheDocument();
  });

  it("renders nested objects", () => {
    render(<JsonView data={{ contact: { name: "John" } }} />);
    expect(screen.getByText("contact:")).toBeInTheDocument();
    expect(screen.getByText("name:")).toBeInTheDocument();
    expect(screen.getByText('"John"')).toBeInTheDocument();
  });

  it("renders empty object as {}", () => {
    render(<JsonView data={{}} />);
    expect(screen.getByTestId("json-view")).toHaveTextContent("{}");
  });

  it("renders empty array as []", () => {
    render(<JsonView data={[]} />);
    expect(screen.getByTestId("json-view")).toHaveTextContent("[]");
  });

  it("handles undefined data gracefully", () => {
    render(<JsonView data={undefined} />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("applies type-specific colors to values", () => {
    render(
      <JsonView data={{ name: "John", count: 5, active: true, note: null }} />,
    );
    const stringValue = screen.getByText('"John"');
    expect(stringValue.className).toMatch(/text-green/);
    const numberValue = screen.getByText("5");
    expect(numberValue.className).toMatch(/text-blue/);
    const boolValue = screen.getByText("true");
    expect(boolValue.className).toMatch(/text-amber/);
  });
});
