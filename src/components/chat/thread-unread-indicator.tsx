/**
 * Decorative unread marker for chat thread rows.
 * Uses semantic success tokens and a subdued pulse to improve scanability
 * without overwhelming the sidebar.
 * @module components/chat/thread-unread-indicator
 */
"use client";

import { cn } from "@/lib/utils";

interface ThreadUnreadIndicatorProps {
  /** Optional class overrides for layout contexts with tighter spacing. */
  className?: string;
}

export function ThreadUnreadIndicator({
  className,
}: ThreadUnreadIndicatorProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="thread-unread-dot"
      className={cn(
        "relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center",
        className,
      )}
    >
      <span className="thread-unread-pulse absolute -inset-0.5 rounded-full bg-success/28" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-success" />
    </span>
  );
}
