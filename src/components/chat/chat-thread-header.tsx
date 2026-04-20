/**
 * Header strip for chat threads that were spawned by an automation trigger.
 * Shows a breadcrumb (Automations / trigger name / thread title) on the left
 * and a schedule widget (icon + name + cadence + countdown) on the right.
 *
 * Renders nothing when the thread has no linked trigger.
 * @module components/chat/chat-thread-header
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { useThreads } from "@/contexts/thread-context";
import { useTriggerByThreadId } from "@/hooks/use-triggers";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";

interface ChatThreadHeaderProps {
  threadId: string;
}

export function ChatThreadHeader({ threadId }: ChatThreadHeaderProps) {
  const { data: trigger } = useTriggerByThreadId(threadId);
  const { threads } = useThreads();

  const threadTitle = useMemo(
    () => threads.find((t) => t.id === threadId)?.title,
    [threads, threadId],
  );

  if (!trigger) return null;

  const scheduleLabel = cronToHuman(trigger.cron_expression);
  const countdown =
    trigger.enabled && trigger.next_fire_at
      ? formatCountdown(trigger.next_fire_at)
      : null;

  return (
    <header className="flex items-start justify-between gap-4 border-b border-border/40 bg-card px-6 py-3">
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
        <AppIcon name="automations" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <Link
          href="/automations"
          className="shrink-0 transition-colors hover:text-foreground"
        >
          Automations
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <Link
          href={`/automations/${trigger.id}`}
          className="max-w-[14rem] truncate transition-colors hover:text-foreground"
        >
          {trigger.name}
        </Link>
        {threadTitle ? (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className="min-w-0 truncate text-foreground">{threadTitle}</span>
          </>
        ) : null}
      </nav>

      <Link
        href={`/automations/${trigger.id}`}
        className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg border border-border/60 bg-background px-3 py-2 shadow-sm transition-colors hover:border-border hover:bg-muted/40"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-hover:text-foreground">
          <AppIcon name="automations" className="h-3.5 w-3.5" />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-foreground">
            {trigger.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {scheduleLabel}
            {countdown ? ` · ${countdown}` : null}
          </span>
        </span>
      </Link>
    </header>
  );
}
