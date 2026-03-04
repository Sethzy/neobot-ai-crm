/**
 * Chat-section loading fallback.
 * Uses a non-blocking shell instead of a center spinner for instant-feeling transitions.
 * @module app/(dashboard)/chat/loading
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="chat-loading-shell"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-5 sm:px-4 sm:py-6">
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-end gap-2.5 sm:gap-3">
          <div className="flex items-end gap-2 self-start">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full bg-muted/60" />
            <Skeleton
              className="h-14 w-[82%] max-w-[28rem] rounded-2xl bg-muted/50 sm:w-[68%]"
              style={{ animationDelay: "60ms" }}
            />
          </div>
          <Skeleton
            className="h-11 w-[70%] max-w-[20rem] self-end rounded-2xl bg-muted/40 sm:w-[52%]"
            style={{ animationDelay: "140ms" }}
          />
        </div>
      </div>

      <div className="border-t border-border/40 bg-background/95 px-3 py-3 sm:px-4">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <Skeleton
            data-testid="chat-loading-composer-skeleton"
            className="h-10 flex-1 rounded-xl border border-border/40 bg-muted/50"
          />
          <Skeleton className="h-10 w-10 shrink-0 rounded-md bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
