/**
 * Sidebar thread rail for chat conversations.
 * @module components/chat/thread-rail
 */
"use client";

import { Plus } from "lucide-react";

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { Thread } from "@/types/chat";

interface ThreadRailProps {
  threads: Thread[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
}

export function ThreadRail({ threads, activeThreadId, onSelectThread, onNewThread }: ThreadRailProps) {
  return (
    <SidebarMenuSub>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          href="#"
          aria-label="New Chat"
          className="text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.preventDefault();
            onNewThread();
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Chat</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      {threads.map((thread) => (
        <SidebarMenuSubItem key={thread.id}>
          <SidebarMenuSubButton
            href="#"
            isActive={thread.id === activeThreadId}
            onClick={(event) => {
              event.preventDefault();
              onSelectThread(thread.id);
            }}
          >
            <span className="truncate">{thread.title}</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}
