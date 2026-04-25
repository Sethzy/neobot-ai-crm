/**
 * Compact message quota pill displayed above the chat composer.
 * Separated from the composer so it can be easily repositioned or removed.
 * @module components/chat/message-quota-pill
 */
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  formatMessageQuotaResetDate,
  type MessageQuotaStatus,
} from "@/lib/usage/message-quota";

interface MessageQuotaPillProps {
  quota: MessageQuotaStatus;
  className?: string;
}

export function MessageQuotaPill({ quota, className }: MessageQuotaPillProps) {
  const isExhausted = quota.messagesRemaining <= 0;
  const resetLabel = formatMessageQuotaResetDate(quota.nextResetDate);

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 type-control",
        className,
      )}
    >
      <span className={cn("text-muted-foreground", isExhausted && "text-destructive")}>
        {isExhausted
          ? `Limit reached — resets ${resetLabel}`
          : `${quota.messagesUsed} / ${quota.monthlyMessageLimit} messages`}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <Link
        className={cn(
          "inline-flex min-h-11 items-center type-control sm:min-h-0",
          isExhausted ? "text-destructive" : "text-primary",
        )}
        href="/pricing"
      >
        Upgrade plan
      </Link>
    </div>
  );
}
