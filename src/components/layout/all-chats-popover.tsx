/**
 * Popover that lists every chat thread with client-side title search.
 * Anchored to the sidebar's "All chats" row.
 * @module components/layout/all-chats-popover
 */
'use client';

import Link from "next/link";
import { format } from "date-fns";
import { useMemo, useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useThreads } from "@/contexts/thread-context";
import { cn } from "@/lib/utils";

interface AllChatsPopoverProps {
  /** Current pathname — used to highlight the active thread row. */
  pathname: string;
  /** Called when the user activates a chat row or presses `+`. */
  onNavigate: () => void;
  /** Element rendered as the popover trigger. */
  children: React.ReactNode;
}

export function AllChatsPopover({ pathname, onNavigate, children }: AllChatsPopoverProps) {
  const { threads } = useThreads();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return threads;
    }
    return threads.filter((thread) => thread.title.toLowerCase().includes(trimmed));
  }, [threads, query]);

  const handleSelect = () => {
    setOpen(false);
    setQuery("");
    onNavigate();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={16}
        collisionPadding={0}
        className="flex h-screen w-[14rem] flex-col rounded-none border-x border-border p-2 shadow-none ring-0"
      >
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="type-toolbar-title text-foreground">Chats</div>
          <Link
            href="/chat"
            onClick={handleSelect}
            aria-label="New chat"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <AppIcon name="add" className="h-4 w-4" />
          </Link>
        </div>
        <div className="relative pb-2">
          <AppIcon
            name="search"
            className="pointer-events-none absolute left-2.5 top-[18px] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats..."
            className="h-9 border-border pl-8 focus-visible:border-border focus-visible:ring-0"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center type-empty-copy text-muted-foreground">
              No chats found
            </div>
          ) : (
            filtered.map((thread) => {
              const isActive = pathname.startsWith(`/chat/${thread.id}`);
              return (
                <Link
                  key={thread.id}
                  href={`/chat/${thread.id}`}
                  onClick={handleSelect}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60",
                    isActive && "bg-muted/60",
                  )}
                >
                  <AppIcon
                    name={
                      thread.isPrimary
                        ? "home"
                        : thread.sourceType === "automation_run"
                          ? "automations"
                          : "chat"
                    }
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="flex-1 truncate type-control">{thread.title}</span>
                  <span className="shrink-0 type-row-meta text-muted-foreground">
                    {format(thread.createdAt, "MMM d")}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
