/**
 * Tests for the reusable chat attachment preview.
 * @module components/chat/preview-attachment.test
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewAttachment } from "./preview-attachment";

describe("PreviewAttachment", () => {
  const imageAttachment = {
    filename: "photo.jpg",
    url: "https://storage.example.com/photo.jpg",
    contentType: "image/jpeg",
  };

  it("renders an image thumbnail for image attachments", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);

    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("src", "https://storage.example.com/photo.jpg");
    expect(image).toHaveAttribute("alt", "photo.jpg");
  });

  it("renders the attachment filename label", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });

  it("shows the uploading overlay when isUploading is true", () => {
    render(
      <PreviewAttachment
        attachment={{ filename: "uploading.jpg", url: "", contentType: "" }}
        isUploading
      />,
    );

    expect(screen.getByTestId("input-attachment-loader")).toBeInTheDocument();
  });

  it("calls onRemove when the remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<PreviewAttachment attachment={imageAttachment} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { name: /remove photo.jpg/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("does not render a remove button when onRemove is omitted", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a file fallback for non-image attachments", () => {
    render(
      <PreviewAttachment
        attachment={{
          filename: "brief.pdf",
          url: "https://storage.example.com/brief.pdf",
          contentType: "application/pdf",
        }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
  });

  it("renders a Word label for DOCX attachments", () => {
    render(
      <PreviewAttachment
        attachment={{
          filename: "proposal.docx",
          url: "https://storage.example.com/proposal.docx",
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }}
      />,
    );

    expect(screen.getByText("Word")).toBeInTheDocument();
  });
});
