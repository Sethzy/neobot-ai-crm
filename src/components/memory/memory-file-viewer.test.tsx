/**
 * Tests for the memory file viewer/editor component.
 * @module components/memory/memory-file-viewer
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemoryFileViewer } from "./memory-file-viewer";

describe("MemoryFileViewer", () => {
  it("keeps edit mode open when save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Save failed"));
    render(
      <MemoryFileViewer
        path="SOUL.md"
        content="initial content"
        isLoading={false}
        isSaving={false}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "updated content" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("resets draft when path changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <MemoryFileViewer
        key="SOUL.md"
        path="SOUL.md"
        content="soul content"
        isLoading={false}
        isSaving={false}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved edits" } });

    rerender(
      <MemoryFileViewer
        key="USER.md"
        path="USER.md"
        content="user content"
        isLoading={false}
        isSaving={false}
        onSave={onSave}
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("user content")).toBeInTheDocument();
  });
});
