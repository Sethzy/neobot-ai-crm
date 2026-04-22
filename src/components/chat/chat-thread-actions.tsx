/**
 * Overflow menu rendered at the top-right of a chat thread page.
 * Owns the Archive action previously attached to sidebar thread rows.
 * @module components/chat/chat-thread-actions
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { AppIcon } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThreads } from "@/contexts/thread-context";

interface ChatThreadActionsProps {
  threadId: string;
}

export function ChatThreadActions({ threadId }: ChatThreadActionsProps) {
  const router = useRouter();
  const { threads, archiveThread } = useThreads();
  const thread = threads.find((t) => t.id === threadId);

  const handleArchive = useCallback(async () => {
    let hasArchived = false;
    try {
      hasArchived = await archiveThread(threadId);
    } catch {
      toast.error("Failed to archive chat.");
      return;
    }

    if (!hasArchived) {
      toast.error("Failed to archive chat.");
      return;
    }

    const nextThread = threads.find((t) => t.id !== threadId);
    router.push(nextThread ? `/chat/${nextThread.id}` : "/chat");
  }, [archiveThread, router, threadId, threads]);

  if (!thread || thread.isPinned) {
    return null;
  }

  return (
    <div className="absolute right-3 top-3 z-10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${thread.title}`}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <AppIcon name="more" className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleArchive}>
            <AppIcon name="archive" className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
