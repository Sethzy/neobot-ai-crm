/**
 * Route-level loading fallback for chat thread transitions.
 * Skeleton shapes match the real message layout: right-aligned user bubble,
 * flat left-aligned assistant text lines (no bubble).
 * @module app/(dashboard)/chat/[threadId]/loading
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="chat-thread-loading-shell"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative flex-1 min-h-0 overflow-hidden px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* User message skeleton — right-aligned bubble */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-[45%] max-w-[18rem] rounded-2xl rounded-br-md bg-muted/40" />
          </div>

          {/* Assistant message skeleton — flat text lines, no bubble */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded bg-muted/50" />
              <Skeleton className="h-3 w-14 bg-muted/50" />
            </div>
            <Skeleton className="h-3 w-[85%] bg-muted/40" style={{ animationDelay: "50ms" }} />
            <Skeleton className="h-3 w-[90%] bg-muted/40" style={{ animationDelay: "100ms" }} />
            <Skeleton className="h-3 w-[40%] bg-muted/40" style={{ animationDelay: "150ms" }} />
          </div>
        </div>
      </div>

      <div className="border-t border-border/40 bg-background/95 px-3 py-3 sm:px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <Skeleton
            data-testid="chat-thread-loading-composer-skeleton"
            className="h-10 flex-1 rounded-xl border border-border/40 bg-muted/50"
          />
          <Skeleton className="h-10 w-10 shrink-0 rounded-md bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
