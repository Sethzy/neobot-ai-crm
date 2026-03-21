/**
 * Telegram connection card for Settings.
 * @module app/(dashboard)/settings/telegram-connect-card
 */
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TelegramConnectCardProps {
  initialChatId: string | null;
}

export function TelegramConnectCard({ initialChatId }: TelegramConnectCardProps) {
  const [chatId, setChatId] = useState(initialChatId);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGenerateLink() {
    setIsLoading(true);
    setErrorText(null);

    try {
      const response = await fetch("/api/telegram/generate-pairing-link", {
        method: "POST",
      });
      const body = await response.json();

      if (!response.ok) {
        setErrorText((body as Record<string, string>).error ?? "Failed to generate link.");
        return;
      }

      setPairingUrl((body as Record<string, string>).url ?? null);
    } catch {
      setErrorText("Network error.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisconnect() {
    setIsLoading(true);
    setErrorText(null);

    try {
      const response = await fetch("/api/telegram/disconnect", {
        method: "DELETE",
      });
      const body = await response.json();

      if (!response.ok) {
        setErrorText((body as Record<string, string>).error ?? "Failed to disconnect.");
        return;
      }

      setChatId(null);
      setPairingUrl(null);
    } catch {
      setErrorText("Network error.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="gap-2">
        <CardDescription>Channels</CardDescription>
        <CardTitle className="text-xl">Telegram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Pair Telegram so you can message your agent from your phone. Messages stay routed to
          the same Sunder thread until you explicitly start a new Telegram chat.
        </p>

        {chatId ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4">
            <p className="font-medium text-foreground">Telegram is connected.</p>
            <p>Current chat: {chatId}</p>
          </div>
        ) : pairingUrl ? (
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <p className="font-medium text-foreground">Pairing link ready.</p>
            <p>Open Telegram and confirm the connection from your phone.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <p className="font-medium text-foreground">Not connected.</p>
            <p>Generate a deep link, open Telegram, and tap Start to pair this workspace.</p>
          </div>
        )}

        {errorText ? <p className="text-destructive">{errorText}</p> : null}
      </CardContent>

      <CardFooter className="border-t">
        {chatId ? (
          <Button variant="outline" disabled={isLoading} onClick={handleDisconnect}>
            {isLoading ? "Disconnecting..." : "Disconnect Telegram"}
          </Button>
        ) : pairingUrl ? (
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={pairingUrl} target="_blank" rel="noreferrer">
                Open Telegram
              </a>
            </Button>
            <Button variant="outline" disabled={isLoading} onClick={handleGenerateLink}>
              {isLoading ? "Refreshing..." : "Generate new link"}
            </Button>
          </div>
        ) : (
          <Button disabled={isLoading} onClick={handleGenerateLink}>
            {isLoading ? "Generating..." : "Generate pairing link"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
