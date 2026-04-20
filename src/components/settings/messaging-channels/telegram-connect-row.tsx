/**
 * Telegram (DM) connect row for the Messaging Channels page.
 * Five states: idle → generating → link-ready → connected → error.
 * Uses Supabase Realtime to auto-flip to `connected` the moment the webhook
 * writes the mapping row on the user's `/start` tap in Telegram.
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
  clientId: string | null;
  initialChatId: string | null;
}

interface PairingLinkResponse {
  url: string;
  expiresInSeconds: number;
}

type ApiErrorResponse = { error: string };

const telegramMappingKey = (clientId: string | null): readonly unknown[] => [
  "telegram",
  "mapping",
  clientId,
];

async function fetchTelegramChatId(): Promise<string | null> {
  const { data } = await supabase
    .from("conversation_channel_mappings")
    .select("external_conversation_id")
    .eq("channel", "telegram")
    .maybeSingle();
  return data?.external_conversation_id ?? null;
}

function formatRemaining(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TelegramConnectRow({ clientId, initialChatId }: TelegramConnectRowProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => telegramMappingKey(clientId), [clientId]);

  const mappingQuery = useQuery({
    queryKey,
    queryFn: fetchTelegramChatId,
    initialData: initialChatId,
    enabled: clientId !== null,
    staleTime: 30_000,
  });

  useRealtimeTable({
    table: "conversation_channel_mappings",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [queryKey],
    enabled: clientId !== null,
  });

  const chatId = mappingQuery.data ?? null;

  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  // Reset local pairing state whenever the externally-tracked chatId transitions.
  // Adjusting state during render (rather than in a useEffect) avoids an extra
  // commit and the `react-hooks/set-state-in-effect` anti-pattern.
  // See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevChatId, setPrevChatId] = useState(chatId);
  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    if (pairingUrl || linkExpiresAt || errorText) {
      setPairingUrl(null);
      setLinkExpiresAt(null);
      setErrorText(null);
    }
  }

  useEffect(() => {
    if (!pairingUrl || linkExpiresAt === null) {
      return;
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [pairingUrl, linkExpiresAt]);

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
      setPairingUrl(body.url);
      setLinkExpiresAt(Date.now() + body.expiresInSeconds * 1000);
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
    setPairingUrl(null);
    setLinkExpiresAt(null);
    setErrorText(null);
  }

  const secondsRemaining =
    pairingUrl && linkExpiresAt !== null ? Math.max(0, (linkExpiresAt - now) / 1000) : 0;
  const isExpired = pairingUrl !== null && secondsRemaining === 0;

  // Auto-clear an expired link after a brief "expired" notice is shown.
  useEffect(() => {
    if (!isExpired) return;
    const t = setTimeout(() => {
      setPairingUrl(null);
      setLinkExpiresAt(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [isExpired]);

  // Derive the right-side action button + body content.
  let action: React.ReactNode;
  let body: React.ReactNode = null;

  if (chatId) {
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
      <p className="text-sm text-muted-foreground">
        Connected. Chat: <span className="font-mono text-foreground">{chatId}</span>
      </p>
    );
  } else if (pairingUrl && !isExpired) {
    action = (
      <Button variant="outline" size="sm" onClick={handleCancel}>
        Cancel
      </Button>
    );
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Open the link in Telegram and tap <span className="font-medium text-foreground">Start</span> to pair this workspace.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm">
            <a href={pairingUrl} target="_blank" rel="noreferrer">
              Open Telegram
            </a>
          </Button>
          <span className="text-xs text-muted-foreground">
            Waiting for connection… link expires in{" "}
            <span className="font-mono text-foreground">{formatRemaining(secondsRemaining)}</span>
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
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
      <p className="text-sm text-muted-foreground">
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
      title="Telegram"
      description="Message your agent from your personal Telegram chat."
      action={action}
    >
      {body}
      {errorText ? (
        <p className="mt-2 text-sm text-destructive">{errorText}</p>
      ) : null}
    </ChannelRow>
  );
}
