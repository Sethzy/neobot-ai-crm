/**
 * Tests for markdown link rewriting in chat message rendering.
 * @module components/ai-elements/message.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageResponse } from "./message";

describe("MessageResponse", () => {
  it("rewrites sunder:// links to the file download endpoint", () => {
    render(
      <MessageResponse>
        Download [Report](sunder:///agent/home/q1-report.pdf)
      </MessageResponse>,
    );

    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
      "href",
      "/api/files/download?path=home%2Fq1-report.pdf",
    );
  });

  it("leaves non-sunder links unchanged", () => {
    render(
      <MessageResponse>
        Visit [Google](https://google.com)
      </MessageResponse>,
    );

    expect(screen.getByRole("link", { name: "Google" })).toHaveAttribute(
      "href",
      "https://google.com/",
    );
  });
});
