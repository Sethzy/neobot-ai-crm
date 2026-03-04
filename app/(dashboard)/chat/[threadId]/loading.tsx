/**
 * Route-level loading fallback for chat thread transitions.
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
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-5 sm:px-4 sm:py-6">
        <div
          className="mx-auto max-w-2xl space-y-2.5 sm:space-y-3"
          data-testid="chat-thread-loading-message-skeletons"
        >
          <div className="flex items-end gap-2">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full bg-muted/60" />
            <Skeleton
              className="h-14 w-[80%] max-w-[28rem] rounded-2xl bg-muted/50 sm:w-[66%]"
              style={{ animationDelay: "50ms" }}
            />
          </div>
          <Skeleton
            className="ml-auto h-11 w-[72%] max-w-[20rem] rounded-2xl bg-muted/40 sm:w-[54%]"
            style={{ animationDelay: "130ms" }}
          />
          <div className="flex items-end gap-2">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full bg-muted/60" />
            <Skeleton
              className="h-20 w-[88%] max-w-[30rem] rounded-2xl bg-muted/45 sm:w-[74%]"
              style={{ animationDelay: "210ms" }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border/40 bg-background/95 px-3 py-3 sm:px-4">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
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
