/**
 * Memory page for viewing and editing memory files.
 * @module app/(dashboard)/memory/page
 */
"use client";

import { useState } from "react";

import { MemoryFileList } from "@/components/memory/memory-file-list";
import { MemoryFileViewer } from "@/components/memory/memory-file-viewer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useMemoryFile,
  useMemoryFiles,
  useUpdateMemoryFile,
} from "@/lib/memory/queries";

export default function MemoryPage() {
  const [selectedPath, setSelectedPath] = useState<string | null>("SOUL.md");
  const [isFileListVisible, setIsFileListVisible] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isMobile = useIsMobile();

  const { data: files, isLoading: filesLoading } = useMemoryFiles();
  const {
    data: content,
    isLoading: contentLoading,
    isError: isContentError,
    error: contentError,
    refetch: refetchContent,
  } = useMemoryFile(selectedPath);
  const updateFile = useUpdateMemoryFile();

  async function handleSave(newContent: string) {
    if (!selectedPath) return;
    await updateFile.mutateAsync({ path: selectedPath, content: newContent });
  }

  function handleSelectPath(path: string) {
    if (selectedPath === path) {
      return;
    }

    if (hasUnsavedChanges) {
      const shouldDiscard = window.confirm(
        "You have unsaved changes. Discard them and switch files?",
      );
      if (!shouldDiscard) {
        return;
      }
    }

    setSelectedPath(path);
    setHasUnsavedChanges(false);
    if (isMobile) {
      setIsFileListVisible(false);
    }
  }

  const contentLoadErrorMessage = isContentError
    ? contentError instanceof Error
      ? contentError.message
      : "Failed to load memory file."
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <h1 className="text-lg font-semibold">Memory</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsFileListVisible((current) => !current)}
        >
          {isFileListVisible ? "Hide Files" : "Show Files"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {isFileListVisible ? (
          <aside className="min-h-0 border-b md:w-72 md:shrink-0 md:border-b-0 md:border-r">
            <MemoryFileList
              files={files}
              isLoading={filesLoading}
              selectedPath={selectedPath}
              onSelect={handleSelectPath}
            />
          </aside>
        ) : null}

        <section className="min-h-0 flex-1">
          {selectedPath ? (
            <MemoryFileViewer
              key={selectedPath}
              path={selectedPath}
              content={content}
              isLoading={contentLoading}
              isSaving={updateFile.isPending}
              loadErrorMessage={contentLoadErrorMessage}
              onRetry={() => {
                void refetchContent();
              }}
              onSave={handleSave}
              onDirtyStateChange={setHasUnsavedChanges}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a file to view its contents.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
