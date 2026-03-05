/**
 * Tests for Memory page behavior.
 * @module app/(dashboard)/memory/page
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemoryPage from "./page";

vi.mock("@/lib/memory/queries", () => ({
  useMemoryFiles: vi.fn(),
  useMemoryFile: vi.fn(),
  useUpdateMemoryFile: vi.fn(),
}));

describe("MemoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for confirmation before switching files with unsaved edits", async () => {
    const {
      useMemoryFiles,
      useMemoryFile,
      useUpdateMemoryFile,
    } = await import("@/lib/memory/queries");

    vi.mocked(useMemoryFiles).mockReturnValue({
      data: [
        { name: "SOUL.md", path: "SOUL.md", updatedAt: null },
        { name: "USER.md", path: "USER.md", updatedAt: null },
      ],
      isLoading: false,
    } as never);

    vi.mocked(useMemoryFile).mockImplementation((path: string | null) => ({
      data: path ? `content for ${path}` : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }) as never);

    vi.mocked(useUpdateMemoryFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: "USER.md" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: "SOUL.md" })).toBeInTheDocument();
  });

  it("toggles file list visibility from header control", async () => {
    const {
      useMemoryFiles,
      useMemoryFile,
      useUpdateMemoryFile,
    } = await import("@/lib/memory/queries");

    vi.mocked(useMemoryFiles).mockReturnValue({
      data: [{ name: "SOUL.md", path: "SOUL.md", updatedAt: null }],
      isLoading: false,
    } as never);

    vi.mocked(useMemoryFile).mockReturnValue({
      data: "content",
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    vi.mocked(useUpdateMemoryFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);

    render(<MemoryPage />);

    const toggle = screen.getByRole("button", { name: /hide files/i });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /show files/i })).toBeInTheDocument();
  });

  it("keeps file list visible on desktop after selecting a file", async () => {
    const {
      useMemoryFiles,
      useMemoryFile,
      useUpdateMemoryFile,
    } = await import("@/lib/memory/queries");

    vi.spyOn(window, "matchMedia").mockImplementation(
      vi.fn().mockReturnValue({ matches: false }),
    );

    vi.mocked(useMemoryFiles).mockReturnValue({
      data: [
        { name: "SOUL.md", path: "SOUL.md", updatedAt: null },
        { name: "USER.md", path: "USER.md", updatedAt: null },
      ],
      isLoading: false,
    } as never);

    vi.mocked(useMemoryFile).mockImplementation((path: string | null) => ({
      data: path ? `content for ${path}` : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }) as never);

    vi.mocked(useUpdateMemoryFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);

    render(<MemoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "USER.md" }));

    expect(screen.getByRole("button", { name: /hide files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SOUL\.md/i })).toBeInTheDocument();
  });

  it("auto-hides file list on mobile after selecting a file", async () => {
    const {
      useMemoryFiles,
      useMemoryFile,
      useUpdateMemoryFile,
    } = await import("@/lib/memory/queries");

    vi.spyOn(window, "matchMedia").mockImplementation(
      vi.fn().mockReturnValue({ matches: true }),
    );

    vi.mocked(useMemoryFiles).mockReturnValue({
      data: [
        { name: "SOUL.md", path: "SOUL.md", updatedAt: null },
        { name: "USER.md", path: "USER.md", updatedAt: null },
      ],
      isLoading: false,
    } as never);

    vi.mocked(useMemoryFile).mockImplementation((path: string | null) => ({
      data: path ? `content for ${path}` : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }) as never);

    vi.mocked(useUpdateMemoryFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);

    render(<MemoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "USER.md" }));

    expect(screen.getByRole("button", { name: /show files/i })).toBeInTheDocument();
  });

  it("shows load error and disables editing when file read fails", async () => {
    const {
      useMemoryFiles,
      useMemoryFile,
      useUpdateMemoryFile,
    } = await import("@/lib/memory/queries");

    vi.mocked(useMemoryFiles).mockReturnValue({
      data: [{ name: "SOUL.md", path: "SOUL.md", updatedAt: null }],
      isLoading: false,
    } as never);

    vi.mocked(useMemoryFile).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load memory file."),
      refetch: vi.fn(),
    } as never);

    vi.mocked(useUpdateMemoryFile).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);

    render(<MemoryPage />);

    expect(screen.getByText("Failed to load memory file.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
