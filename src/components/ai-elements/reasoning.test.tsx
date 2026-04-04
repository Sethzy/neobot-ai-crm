/**
 * Tests for the inline reasoning trigger and content presentation.
 * @module components/ai-elements/reasoning.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";

describe("ReasoningTrigger", () => {
  it("renders duration text without paragraph blocks", () => {
    const { container } = render(
      <Reasoning duration={3}>
        <ReasoningTrigger />
        <ReasoningContent>Checking the CRM pipeline.</ReasoningContent>
      </Reasoning>,
    );

    const trigger = screen.getByRole("button");

    expect(trigger).toHaveTextContent("Thought for 3 seconds");
    expect(container.querySelector("button p")).toBeNull();
  });

  it("shows the completed duration immediately when streaming stops", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T00:00:00.000Z"));

    const { rerender } = render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>Checking the CRM pipeline.</ReasoningContent>
      </Reasoning>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("Thinking...");

    vi.setSystemTime(new Date("2026-04-03T00:00:01.200Z"));

    rerender(
      <Reasoning isStreaming={false}>
        <ReasoningTrigger />
        <ReasoningContent>Checking the CRM pipeline.</ReasoningContent>
      </Reasoning>,
    );

    const trigger = screen.getByRole("button");

    expect(trigger).toHaveTextContent("Thought for 2 seconds");
    expect(trigger).not.toHaveTextContent("Thought for a few seconds");

    vi.useRealTimers();
  });
});
