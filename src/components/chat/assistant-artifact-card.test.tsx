/**
 * Tests for the assistant-only chat artifact card.
 * @module components/chat/assistant-artifact-card.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AssistantArtifactCard } from "./assistant-artifact-card";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe("AssistantArtifactCard", () => {
  it("renders filename, file type label, and download action", () => {
    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "pipeline-report.csv",
            url: "/api/files/download?path=home%2Foutputs%2Fpipeline-report.csv",
            contentType: "text/csv",
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByText("pipeline-report.csv")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download pipeline-report.csv/i })).toHaveAttribute(
      "href",
      "/api/files/download?path=home%2Foutputs%2Fpipeline-report.csv",
    );
  });

  it("uses direct url values for legacy file parts", () => {
    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "legacy.pdf",
            url: "https://storage.example.com/legacy.pdf",
            contentType: "application/pdf",
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByRole("link", { name: /download legacy.pdf/i })).toHaveAttribute(
      "href",
      "https://storage.example.com/legacy.pdf",
    );
  });

  it("calls onImageClick for image artifacts", async () => {
    const user = userEvent.setup();
    const onImageClick = vi.fn();

    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "screenshot.png",
            url: "https://storage.example.com/screenshot.png",
            contentType: "image/png",
          }}
          onImageClick={onImageClick}
        />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /open screenshot.png/i }));
    expect(onImageClick).toHaveBeenCalledWith("https://storage.example.com/screenshot.png");
  });

  it("renders a file-type fallback label for markdown artifacts", () => {
    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "brief.md",
            url: "/api/files/download?path=home%2Foutputs%2Fbrief.md",
            contentType: "text/markdown",
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByText("Markdown")).toBeInTheDocument();
  });

  it("prefers filename over generic 'Download X' displayName", () => {
    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "fiata-cleaned-v2.csv",
            url: "/api/files/download?path=home%2Ffiata-cleaned-v2.csv",
            contentType: "text/csv",
          }}
          displayName="Download CSV"
        />
      </Wrapper>,
    );

    expect(screen.getByText("fiata-cleaned-v2.csv")).toBeInTheDocument();
    expect(screen.queryByText("Download CSV")).not.toBeInTheDocument();
  });

  it("prefers displayName over raw filename when provided", () => {
    render(
      <Wrapper>
        <AssistantArtifactCard
          attachment={{
            filename: "1776011853790-5e76e7e4-findings.md",
            url: "/api/files/download?path=home%2Foutputs%2Ffindings.md",
            contentType: "text/markdown",
          }}
          displayName="FUSE Investigation Findings"
        />
      </Wrapper>,
    );

    expect(screen.getByText("FUSE Investigation Findings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download fuse investigation findings/i })).toBeInTheDocument();
  });
});
