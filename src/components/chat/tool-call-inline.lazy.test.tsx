/**
 * Regression tests for lazy loading the show_view renderer.
 * @module components/chat/tool-call-inline.lazy.test
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("next/dynamic");
  vi.doUnmock("@/components/views/view-card");
});

describe("ToolCallInline lazy show_view loading", () => {
  it("does not eagerly import view-card for non-show_view tool calls", async () => {
    vi.doMock("next/dynamic", () => ({
      default: () => {
        return function DynamicPlaceholder() {
          return null;
        };
      },
    }));
    vi.doMock("@/components/views/view-card", () => {
      throw new Error("view-card imported eagerly");
    });

    const { ToolCallInline } = await import("./tool-call-inline");

    render(
      <ToolCallInline
        name="search_contacts"
        state="output-available"
        input={{ query: "John" }}
        output={{ results: [] }}
      />,
    );

    expect(screen.getByTestId("tool-expand-trigger")).toBeInTheDocument();
    expect(screen.getByText("search_contacts")).toBeInTheDocument();
  });
});
