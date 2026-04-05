/**
 * Tests for the AttachmentRow component.
 * @module components/crm/record-drawer/__tests__/attachment-row
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttachmentRow } from "../attachment-row";

const baseAttachment = {
  attachment_id: "att-1",
  client_id: "cl-1",
  record_type: "contact" as const,
  record_id: "c-1",
  filename: "proposal.pdf",
  storage_path: "attachments/contact/c-1/uuid-1",
  content_type: "application/pdf",
  file_size: 1024,
  file_category: "pdf" as const,
  created_at: "2026-04-01T00:00:00+00:00",
  updated_at: "2026-04-01T00:00:00+00:00",
};

describe("AttachmentRow", () => {
  it("renders filename and formatted date", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it("renders a file icon row wrapper", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("attachment-row")).toBeInTheDocument();
  });

  it("renders the dropdown trigger button", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /options/i })).toBeInTheDocument();
  });
});
