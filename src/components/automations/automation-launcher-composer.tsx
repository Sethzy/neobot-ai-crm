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
    <div
      className="pointer-events-none sticky bottom-0 z-10 mt-auto pt-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] [&>*]:pointer-events-auto"
      data-testid="automation-launcher-shell"
    >
      <div className="mx-auto w-full max-w-[44rem]" data-testid="automation-launcher-frame">
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
          innerClassName="automation-launcher-input max-w-none"
        />
      </div>
    </div>
  );
}
