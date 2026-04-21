/**
 * Client form for selecting the user's default messaging thread.
 * @module components/settings/profile/default-messaging-agent-form
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MessagingThreadOption } from "@/lib/settings/profile/messaging-preferences";

interface DefaultMessagingAgentFormProps {
  initialDefaultThreadId: string;
  threads: MessagingThreadOption[];
}

function getThreadLabel(thread: MessagingThreadOption): string {
  if (thread.isPrimary) {
    return "Main conversation";
  }

  return thread.title?.trim().length ? thread.title : "Untitled conversation";
}

export function DefaultMessagingAgentForm({
  initialDefaultThreadId,
  threads,
}: DefaultMessagingAgentFormProps) {
  const router = useRouter();
  const [selectedThreadId, setSelectedThreadId] = useState(initialDefaultThreadId);
  const [message, setMessage] = useState<{ isError: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasChanges = selectedThreadId !== initialDefaultThreadId;

  function handleSave() {
    startTransition(async () => {
      setMessage(null);

      try {
        const response = await fetch("/api/settings/profile/default-messaging-thread", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ threadId: selectedThreadId }),
        });

        const payload = (await response.json()) as
          | { defaultThreadId: string }
          | { error: string };

        if (!response.ok || "error" in payload) {
          setMessage({
            isError: true,
            text: "error" in payload ? payload.error : "Failed to save messaging preference.",
          });
          return;
        }

        setMessage({ isError: false, text: "Saved." });
        router.refresh();
      } catch {
        setMessage({ isError: true, text: "Failed to save messaging preference." });
      }
    });
  }

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="gap-2">
        <CardDescription>Where Telegram messages should land</CardDescription>
        <CardTitle className="text-2xl">Default messaging agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose which Sunder conversation should receive your Telegram messages by default.
          This setting is personal to your account.
        </p>

        <div className="space-y-2">
          <label
            htmlFor="default-messaging-thread"
            className="text-sm font-medium text-foreground"
          >
            Default destination
          </label>
          <select
            id="default-messaging-thread"
            aria-label="Default messaging thread"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            disabled={isPending}
            value={selectedThreadId}
            onChange={(event) => {
              setSelectedThreadId(event.target.value);
              setMessage(null);
            }}
          >
            {threads.map((thread) => (
              <option key={thread.threadId} value={thread.threadId}>
                {getThreadLabel(thread)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Telegram still supports temporary thread switches via commands, but this is the default target.
          </p>
          <Button disabled={isPending || !hasChanges} onClick={handleSave}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        {message ? (
          <p className={message.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
