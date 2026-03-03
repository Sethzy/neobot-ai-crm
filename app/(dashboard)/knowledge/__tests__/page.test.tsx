/**
 * Tests for Knowledge Base page states.
 * @module app/(dashboard)/knowledge/__tests__/page
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KnowledgePage from "../page";

vi.mock("@/hooks/use-vault-files", () => ({
  useVaultFiles: vi.fn(),
  useUploadVaultFile: vi.fn(),
}));

vi.mock("@/components/knowledge/vault-files-table", () => ({
  VaultFilesTable: ({ files }: { files: unknown[] }) => (
    <div data-testid="vault-files-table">rows:{files.length}</div>
  ),
}));

describe("KnowledgePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error state and retries when query fails", async () => {
    const { useVaultFiles, useUploadVaultFile } = await import("@/hooks/use-vault-files");
    const mockRefetch = vi.fn();

    vi.mocked(useVaultFiles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    vi.mocked(useUploadVaultFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as never);

    render(<KnowledgePage />);

    expect(screen.getByText(/unable to load files/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state when no files are available", async () => {
    const { useVaultFiles, useUploadVaultFile } = await import("@/hooks/use-vault-files");

    vi.mocked(useVaultFiles).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    vi.mocked(useUploadVaultFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as never);

    render(<KnowledgePage />);

    expect(screen.getByText(/no files yet\. upload documents to get started\./i)).toBeInTheDocument();
  });

  it("shows upload error when upload mutation fails", async () => {
    const { useVaultFiles, useUploadVaultFile } = await import("@/hooks/use-vault-files");

    vi.mocked(useVaultFiles).mockReturnValue({
      data: [{ id: "f1" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    vi.mocked(useUploadVaultFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
      error: { message: "upload failed" },
    } as never);

    render(<KnowledgePage />);

    expect(screen.getByText(/upload failed: upload failed/i)).toBeInTheDocument();
    expect(screen.getByTestId("vault-files-table")).toBeInTheDocument();
  });
});
