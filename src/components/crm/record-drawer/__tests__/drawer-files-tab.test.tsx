/**
 * Tests for DrawerFilesTab component.
 * @module components/crm/record-drawer/__tests__/drawer-files-tab
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrawerFilesTab } from "../drawer-files-tab";

const mockOpen = vi.fn();
const mockUseRecordAttachments = vi.fn();

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: mockOpen,
  }),
}));

vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}));

vi.mock("@/hooks/use-record-attachments", () => ({
  useRecordAttachments: (...args: unknown[]) => mockUseRecordAttachments(...args),
  useUploadAttachment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRenameAttachment: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteAttachment: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe("DrawerFilesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header with count and add button", () => {
    mockUseRecordAttachments.mockReturnValue({
      data: [
        {
          attachment_id: "att-1",
          client_id: "cl-1",
          record_type: "contact",
          record_id: "c-1",
          filename: "proposal.pdf",
          storage_path: "attachments/contact/c-1/uuid-1",
          content_type: "application/pdf",
          file_size: 1024,
          file_category: "pdf",
          created_at: "2026-04-01T00:00:00+00:00",
          updated_at: "2026-04-01T00:00:00+00:00",
        },
        {
          attachment_id: "att-2",
          client_id: "cl-1",
          record_type: "contact",
          record_id: "c-1",
          filename: "budget.xlsx",
          storage_path: "attachments/contact/c-1/uuid-2",
          content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_size: 2048,
          file_category: "spreadsheet",
          created_at: "2026-03-28T00:00:00+00:00",
          updated_at: "2026-03-28T00:00:00+00:00",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DrawerFilesTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("All 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add file/i })).toBeInTheDocument();
  });

  it("renders attachment rows for each file", () => {
    mockUseRecordAttachments.mockReturnValue({
      data: [
        {
          attachment_id: "att-1",
          client_id: "cl-1",
          record_type: "contact",
          record_id: "c-1",
          filename: "proposal.pdf",
          storage_path: "attachments/contact/c-1/uuid-1",
          content_type: "application/pdf",
          file_size: 1024,
          file_category: "pdf",
          created_at: "2026-04-01T00:00:00+00:00",
          updated_at: "2026-04-01T00:00:00+00:00",
        },
        {
          attachment_id: "att-2",
          client_id: "cl-1",
          record_type: "contact",
          record_id: "c-1",
          filename: "budget.xlsx",
          storage_path: "attachments/contact/c-1/uuid-2",
          content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_size: 2048,
          file_category: "spreadsheet",
          created_at: "2026-03-28T00:00:00+00:00",
          updated_at: "2026-03-28T00:00:00+00:00",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DrawerFilesTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.getByText("budget.xlsx")).toBeInTheDocument();
  });

  it("shows the empty state when no attachments exist", () => {
    mockUseRecordAttachments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DrawerFilesTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("No Files")).toBeInTheDocument();
    expect(screen.getByText(/no associated files/i)).toBeInTheDocument();
  });
});
