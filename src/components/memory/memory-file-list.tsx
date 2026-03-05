/**
 * Sidebar list of memory files.
 * @module components/memory/memory-file-list
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ROOT_MEMORY_FILE_SET } from "@/lib/memory/constants";
import type { MemoryFileInfo } from "@/lib/memory/schemas";
import { cn } from "@/lib/utils";

interface MemoryFileListProps {
  files: MemoryFileInfo[] | undefined;
  isLoading: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function MemoryFileList({
  files,
  isLoading,
  selectedPath,
  onSelect,
}: MemoryFileListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const rootFiles = (files ?? []).filter((file) => ROOT_MEMORY_FILE_SET.has(file.path));
  const topicFiles = (files ?? []).filter((file) => !ROOT_MEMORY_FILE_SET.has(file.path));

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        {rootFiles.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
              selectedPath === file.path && "bg-accent",
            )}
          >
            <span className="truncate">{file.name}</span>
            {file.path === "SOUL.md" ? (
              <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                Agent Read-Only
              </Badge>
            ) : null}
          </button>
        ))}

        {topicFiles.length > 0 ? (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Topic Files
            </div>
            {topicFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelect(file.path)}
                className={cn(
                  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                  selectedPath === file.path && "bg-accent",
                )}
              >
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}
