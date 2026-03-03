/**
 * Tests for Knowledge Base vault files table.
 * @module components/knowledge/__tests__/vault-files-table
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VaultFilesTable } from "../vault-files-table";

const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      })),
    },
  },
}));

const rows = [
  {
    file_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    filename: "Floor Plan (Final).md",
    storage_path: "vault/floor-plan-final-1a2b3c4d.md",
    title: "floor-plan-final",
    content_type: "text/markdown",
    size_bytes: 2048,
    content: "sample content",
    tags: [],
    summary: null,
    needs_reprocess: true,
    created_at: "2026-03-03T00:00:00.000Z",
    updated_at: "2026-03-03T00:00:00.000Z",
  },
];

describe("VaultFilesTable", () => {
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders expected columns and row values", () => {
    render(<VaultFilesTable files={rows} />);

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
    expect(screen.getByText("floor-plan-final")).toBeInTheDocument();
    expect(screen.getByText("Floor Plan (Final).md")).toBeInTheDocument();
  });

  it("requests signed URL and triggers download when download action is clicked", async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", {
          value: clickSpy,
          configurable: true,
        });
      }
      return element;
    });

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    render(<VaultFilesTable files={rows} />);

    await user.click(screen.getByTitle(/download/i));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "660e8400-e29b-41d4-a716-446655440000/vault/floor-plan-final-1a2b3c4d.md",
        60,
      );
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it("shows an error message when download URL generation fails", async () => {
    const user = userEvent.setup();

    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "forbidden" },
    });

    render(<VaultFilesTable files={rows} />);

    await user.click(screen.getByTitle(/download/i));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to download file/i);
  });
});
