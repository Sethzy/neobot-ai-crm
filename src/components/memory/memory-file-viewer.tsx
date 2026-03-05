/**
 * Viewer and editor for one memory file.
 * @module components/memory/memory-file-viewer
 */
"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface MemoryFileViewerProps {
  path: string;
  content: string | undefined;
  isLoading: boolean;
  isSaving: boolean;
  loadErrorMessage?: string | null;
  onRetry?: () => void;
  onSave: (content: string) => Promise<void>;
  onDirtyStateChange?: (hasUnsavedChanges: boolean) => void;
}

export function MemoryFileViewer({
  path,
  content,
  isLoading,
  isSaving,
  loadErrorMessage,
  onRetry,
  onSave,
  onDirtyStateChange,
}: MemoryFileViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const resolvedContent = content ?? "";

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadErrorMessage) {
    return (
      <div className="flex h-full min-h-0 flex-col p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-medium">{path}</h2>
            {path === "SOUL.md" ? (
              <Badge variant="outline" className="text-xs">
                Agent Read-Only
              </Badge>
            ) : null}
          </div>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>

        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadErrorMessage}
        </div>
      </div>
    );
  }

  async function handleSave() {
    try {
      setSaveError(null);
      await onSave(editContent);
      setIsEditing(false);
      onDirtyStateChange?.(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setSaveError(message);
    }
  }

  function handleEdit() {
    setSaveError(null);
    setEditContent(resolvedContent);
    setIsEditing(true);
    onDirtyStateChange?.(false);
  }

  function handleCancel() {
    setSaveError(null);
    setEditContent(resolvedContent);
    setIsEditing(false);
    onDirtyStateChange?.(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-medium">{path}</h2>
          {path === "SOUL.md" ? (
            <Badge variant="outline" className="text-xs">
              Agent Read-Only
            </Badge>
          ) : null}
        </div>
        {!isEditing ? (
          <Button type="button" variant="outline" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {saveError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      {isEditing ? (
        <Textarea
          value={editContent}
          onChange={(event) => {
            const newContent = event.target.value;
            setEditContent(newContent);
            onDirtyStateChange?.(newContent !== resolvedContent);
          }}
          className="min-h-0 flex-1 resize-none font-mono text-sm"
          rows={20}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm">
          {resolvedContent}
        </pre>
      )}
    </div>
  );
}
