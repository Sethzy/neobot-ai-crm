/**
 * Inline banner encouraging Telegram pairing on the Agent page.
 * Shown when Telegram is not yet connected. Non-blocking — chat works without it.
 * @module components/agent/telegram-cta-banner
 */
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function TelegramCtaBanner() {
  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-4 max-w-3xl mx-auto">
        <p>
          Connect Telegram to message your agent from your phone.
          Pulses, web chat, and Telegram all flow into this thread.
        </p>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/settings">Connect Telegram</Link>
        </Button>
      </div>
    </div>
  );
}
