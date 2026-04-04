/**
 * Tests for multi-note drawer tab behavior.
 * @module components/crm/record-drawer/__tests__/drawer-notes-tab
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrawerNotesTab } from "../drawer-notes-tab";

const mockUseRecordNotes = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUseUpdateRecordNote = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock("@/hooks/use-record-notes", () => ({
  useRecordNotes: (...args: unknown[]) => mockUseRecordNotes(...args),
  useCreateRecordNote: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateRecordNote: (...args: unknown[]) => mockUseUpdateRecordNote(...args),
  useDeleteRecordNote: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}));

describe("DrawerNotesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateRecordNote.mockReturnValue({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    });
  });

  it("renders loading skeleton cards while notes are loading", () => {
    mockUseRecordNotes.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = render(<DrawerNotesTab recordType="contact" recordId="contact-1" />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
  });

  it("renders the empty state when no notes exist", () => {
    mockUseRecordNotes.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DrawerNotesTab recordType="contact" recordId="contact-1" />);

    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add note/i })).toBeInTheDocument();
  });

  it("renders multiple note cards and the total count", () => {
    mockUseRecordNotes.mockReturnValue({
      data: [
        {
          note_id: "note-1",
          client_id: "client-1",
          record_type: "contact",
          record_id: "contact-1",
          body: "Newest note",
          created_at: "2026-04-05T10:00:00Z",
          updated_at: "2026-04-05T10:00:00Z",
        },
        {
          note_id: "note-2",
          client_id: "client-1",
          record_type: "contact",
          record_id: "contact-1",
          body: "Older note",
          created_at: "2026-04-04T10:00:00Z",
          updated_at: "2026-04-04T10:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DrawerNotesTab recordType="contact" recordId="contact-1" />);

    expect(screen.getByText("All 2")).toBeInTheDocument();
    expect(screen.getByText("Newest note")).toBeInTheDocument();
    expect(screen.getByText("Older note")).toBeInTheDocument();
  });

  it("creates a new empty note when add note is clicked", async () => {
    mockUseRecordNotes.mockReturnValue({
      data: [
        {
          note_id: "note-1",
          client_id: "client-1",
          record_type: "deal",
          record_id: "deal-1",
          body: "Existing note",
          created_at: "2026-04-05T10:00:00Z",
          updated_at: "2026-04-05T10:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockCreateMutateAsync.mockResolvedValue({
      note_id: "note-2",
      client_id: "client-1",
      record_type: "deal",
      record_id: "deal-1",
      body: "",
      created_at: "2026-04-05T11:00:00Z",
      updated_at: "2026-04-05T11:00:00Z",
    });

    render(<DrawerNotesTab recordType="deal" recordId="deal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /add note/i }));

    await waitFor(() =>
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        recordType: "deal",
        recordId: "deal-1",
        body: "",
      }),
    );
  });

  it("enters edit mode on click and saves the updated body on blur", async () => {
    mockUseRecordNotes.mockReturnValue({
      data: [
        {
          note_id: "note-1",
          client_id: "client-1",
          record_type: "company",
          record_id: "company-1",
          body: "Initial note",
          created_at: "2026-04-05T10:00:00Z",
          updated_at: "2026-04-05T10:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUpdateMutateAsync.mockResolvedValue(undefined);

    render(<DrawerNotesTab recordType="company" recordId="company-1" />);

    fireEvent.click(screen.getByRole("button", { name: /initial note/i }));

    const textarea = screen.getByPlaceholderText("Add note...");
    fireEvent.change(textarea, { target: { value: "Updated note body" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(mockUseUpdateRecordNote).toHaveBeenLastCalledWith("note-1"));
    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledWith("Updated note body"));
  });

  it("requires a second click to confirm deletion", async () => {
    mockUseRecordNotes.mockReturnValue({
      data: [
        {
          note_id: "note-1",
          client_id: "client-1",
          record_type: "contact",
          record_id: "contact-1",
          body: "Delete me",
          created_at: "2026-04-05T10:00:00Z",
          updated_at: "2026-04-05T10:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockDeleteMutateAsync.mockResolvedValue(undefined);

    render(<DrawerNotesTab recordType="contact" recordId="contact-1" />);

    const deleteButton = screen.getByRole("button", { name: "Delete note" });
    fireEvent.click(deleteButton);
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete note" }));

    await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith("note-1"));
  });
});
