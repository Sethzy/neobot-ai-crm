/**
 * Tests for the inline reasoning trigger and content presentation.
 * @module components/ai-elements/reasoning.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
