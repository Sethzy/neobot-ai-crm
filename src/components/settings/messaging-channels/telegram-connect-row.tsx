/**
 * Telegram (DM) connect row for personal settings.
 * States: unavailable → idle → generating → waiting → connected → error.
 * Uses Supabase Realtime to flip to `connected` the moment the webhook writes
 * the user-owned connection row.
 * @module components/settings/messaging-channels/telegram-connect-row
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";

import { ChannelRow } from "./channel-row";

interface TelegramConnectRowProps {
  availabilityMessage?: string;
  initialConnection: TelegramConnectionState | null;
  isAvailable: boolean;
  realtimeUserId: string | null;
}

interface TelegramConnectionState {
  chatId: string;
  targetThreadId: string;
}

interface PairingLinkResponse {
  botUsername: string;
  displayCode: string;
  expiresInSeconds: number;
  openUrl: string;
}

type ApiErrorResponse = { error: string };

const telegramConnectionKey = (userId: string | null): readonly unknown[] => [
  "telegram",
  "connection",
  userId,
];

async function fetchTelegramConnection(): Promise<TelegramConnectionState | null> {
  const { data } = await supabase
    .from("messaging_channel_connections")
    .select("external_conversation_id, target_thread_id")
    .eq("channel", "telegram")
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    chatId: data.external_conversation_id,
    targetThreadId: data.target_thread_id,
  };
}

function formatRemaining(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TelegramConnectRow({
  availabilityMessage,
  initialConnection,
  isAvailable,
  realtimeUserId,
}: TelegramConnectRowProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => telegramConnectionKey(realtimeUserId), [realtimeUserId]);

  const connectionQuery = useQuery({
    queryKey,
    queryFn: fetchTelegramConnection,
    initialData: initialConnection,
    enabled: realtimeUserId !== null,
    staleTime: 30_000,
  });

  useRealtimeTable({
    table: "messaging_channel_connections",
    filter: realtimeUserId ? `user_id=eq.${realtimeUserId}` : undefined,
    queryKeys: [queryKey],
    enabled: realtimeUserId !== null,
  });

  const connection = connectionQuery.data ?? null;
  const chatId = connection?.chatId ?? null;

  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [didCopyCode, setDidCopyCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const connectionKey = chatId ?? "__none__";

  useEffect(() => {
    setBotUsername(null);
    setDisplayCode(null);
    setLinkExpiresAt(null);
    setOpenUrl(null);
    setErrorText(null);
    setDidCopyCode(false);
  }, [connectionKey]);

  useEffect(() => {
    if (!openUrl || linkExpiresAt === null) {
      return;
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [openUrl, linkExpiresAt]);

  async function handleConnect() {
    setIsGenerating(true);
    setErrorText(null);
    try {
      const response = await fetch("/api/telegram/generate-pairing-link", { method: "POST" });
      const body = (await response.json()) as PairingLinkResponse | ApiErrorResponse;
      if (!response.ok || "error" in body) {
        setErrorText(
          "error" in body ? body.error : "Failed to generate Telegram pairing link.",
        );
        return;
      }
      setBotUsername(body.botUsername);
      setDisplayCode(body.displayCode);
      setLinkExpiresAt(Date.now() + body.expiresInSeconds * 1000);
      setOpenUrl(body.openUrl);
    } catch {
      setErrorText("Network error. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    setErrorText(null);
    try {
      const response = await fetch("/api/telegram/disconnect", { method: "DELETE" });
      const body = (await response.json()) as { success?: true } | ApiErrorResponse;
      if (!response.ok || "error" in body) {
        setErrorText("error" in body ? body.error : "Failed to disconnect Telegram.");
        return;
      }
      // Optimistically clear locally; realtime DELETE event will confirm.
      queryClient.setQueryData(queryKey, null);
    } catch {
      setErrorText("Network error. Try again.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  function handleCancel() {
    setBotUsername(null);
    setDisplayCode(null);
    setLinkExpiresAt(null);
    setOpenUrl(null);
    setErrorText(null);
    setDidCopyCode(false);
  }

  async function handleCopyCode() {
    if (!displayCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(displayCode);
      setDidCopyCode(true);
    } catch {
      setErrorText("Failed to copy pairing code.");
    }
  }

  const secondsRemaining =
    openUrl && linkExpiresAt !== null ? Math.max(0, (linkExpiresAt - now) / 1000) : 0;
  const isExpired = openUrl !== null && secondsRemaining === 0;

  useEffect(() => {
    if (!isExpired) return;
    const t = setTimeout(() => {
      setBotUsername(null);
      setDisplayCode(null);
      setLinkExpiresAt(null);
      setOpenUrl(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [isExpired]);

  let action: React.ReactNode;
  let body: React.ReactNode = null;

  if (!isAvailable) {
    action = (
      <Button variant="outline" size="sm" disabled>
        Unavailable
      </Button>
    );
    body = (
      <p className="type-toolbar-description">
        {availabilityMessage ?? "Telegram is not configured yet."}
      </p>
    );
  } else if (chatId) {
    action = (
      <Button
        variant="outline"
        size="sm"
        onClick={handleDisconnect}
        disabled={isDisconnecting}
      >
        {isDisconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    );
    body = (
      <div className="space-y-1 type-toolbar-description">
        <p>Connected. Telegram is linked to this account.</p>
        <p>
          Chat ID: <span className="font-mono text-foreground">{chatId}</span>
        </p>
      </div>
    );
  } else if (openUrl && displayCode && !isExpired) {
    action = (
      <Button variant="outline" size="sm" onClick={handleCancel}>
        Cancel
      </Button>
    );
    body = (
      <div className="flex flex-col gap-3">
        <p className="type-toolbar-description">
          Send this code to <span className="font-medium text-foreground">@{botUsername}</span> on Telegram, or open Telegram directly.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-body text-foreground">
            {displayCode}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyCode}>
            {didCopyCode ? "Copied" : "Copy code"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm">
            <a href={openUrl} target="_blank" rel="noreferrer">
              Open Telegram
            </a>
          </Button>
          <span className="type-row-meta">
            Waiting for connection… code expires in{" "}
            <span className="font-mono text-foreground">{formatRemaining(secondsRemaining)}</span>
          </span>
          <button
            type="button"
            className="type-row-meta underline hover:text-foreground"
            onClick={handleConnect}
            disabled={isGenerating}
          >
            Refresh link
          </button>
        </div>
      </div>
    );
  } else if (isExpired) {
    action = (
      <Button size="sm" onClick={handleConnect} disabled={isGenerating}>
        {isGenerating ? "Generating…" : "Generate new link"}
      </Button>
    );
    body = (
      <p className="type-toolbar-description">
        The previous pairing link expired. Generate a new one to try again.
      </p>
    );
  } else {
    action = (
      <Button size="sm" onClick={handleConnect} disabled={isGenerating}>
        {isGenerating ? "Generating…" : "Connect"}
      </Button>
    );
  }

  return (
    <ChannelRow
      icon="send"
      iconTint="blue"
      title="Connect Telegram"
      description="Link your personal Telegram chat to your Sunder account."
      action={action}
    >
      {body}
      {errorText ? (
        <p className="mt-2 type-toolbar-description text-destructive">{errorText}</p>
      ) : null}
    </ChannelRow>
  );
}
