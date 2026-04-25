/**
 * Sticky launcher composer shown on the Automations page. It preserves the
 * existing chat-managed automation creation flow by redirecting into `/chat`
 * with a prefilled kickoff prompt that auto-submits on arrival.
 * @module components/automations/automation-launcher-composer
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import {
  CHAT_MODEL_COOKIE_MAX_AGE,
  CHAT_MODEL_COOKIE_NAME,
  DEFAULT_CHAT_MODEL,
  resolveModelId,
} from "@/lib/ai/models";
import { buildAutomationLauncherPrompt } from "@/lib/automations/launcher-prompt";

function readPersistedChatModel(): string {
  if (typeof document === "undefined") {
    return DEFAULT_CHAT_MODEL;
  }

  const serializedCookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${CHAT_MODEL_COOKIE_NAME}=`))
    ?.split("=")[1];

  return resolveModelId(serializedCookie);
}

export function AutomationLauncherComposer() {
  const router = useRouter();
  const [composerValue, setComposerValue] = useState("");
  const [selectedChatModel, setSelectedChatModel] = useState(readPersistedChatModel);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedChatModel(modelId);
    document.cookie = `${CHAT_MODEL_COOKIE_NAME}=${modelId}; path=/; max-age=${CHAT_MODEL_COOKIE_MAX_AGE}`;
  }, []);

  const handleSubmit = useCallback((message: { text: string }) => {
    const prompt = buildAutomationLauncherPrompt(message.text);

    if (prompt.length === 0) {
      return;
    }

    const params = new URLSearchParams({
      prompt,
      autosubmit: "1",
    });

    router.push(`/chat?${params.toString()}`);
    setComposerValue("");
  }, [router]);

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 mt-8 pb-[max(env(safe-area-inset-bottom),0.75rem)] [&>*]:pointer-events-auto">
      <div className="shimmer-border mx-auto max-w-[44rem] rounded-2xl p-[2px] shadow-lg shadow-primary/15">
        <ChatComposer
          status="ready"
          selectedChatModel={selectedChatModel}
          value={composerValue}
          onValueChange={setComposerValue}
          onSelectedChatModelChange={handleModelChange}
          onSubmit={handleSubmit}
          placeholder="Describe an automation to create..."
          allowAttachments={false}
          className="px-0 pb-0"
          innerClassName="rounded-[calc(1rem-2px)] border-0 bg-app-surface-elevated max-w-none"
        />
      </div>
    </div>
  );
}
