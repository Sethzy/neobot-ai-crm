/**
 * Tests for the transcript accordion behavior.
 * @module components/meetings/__tests__/transcript-section.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TranscriptSection } from "../transcript-section";

describe("TranscriptSection", () => {
  it("does not request transcript content until the section is opened", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TranscriptSection
        transcriptText={undefined}
        segments={undefined}
        hasTranscript
        isLoading={false}
        isOpen={false}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /transcript/i }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders a loading message only after expansion", () => {
    render(
      <TranscriptSection
        transcriptText={undefined}
        segments={undefined}
        hasTranscript
        isLoading
        isOpen
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Loading transcript...")).toBeInTheDocument();
  });
});
