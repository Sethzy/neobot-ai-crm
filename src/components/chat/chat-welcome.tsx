/**
 * Welcome screen shown when a chat thread has no messages.
 * Displays a hero heading, centered composer, and categorized template cards.
 * Replicates the Tasklet-style landing page for new conversations.
 * @module components/chat/chat-welcome
 */
"use client";

import type { FileUIPart } from "ai";
import { useCallback, useMemo, useState } from "react";

import { Sparkles } from "@/components/icons/lucide-compat";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";
import { cn } from "@/lib/utils";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/lib/automations/templates";
import type { ChatStatus } from "@/types/chat";

import { ChatComposer } from "./chat-composer";

/** Tab labels mapped from template category IDs. */
const CATEGORY_LABELS: Record<AutomationTemplate["category"], string> = {
  sales: "Sales",
  operations: "Operations",
  research: "Research",
  marketing: "Marketing",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<AutomationTemplate["category"]>;

interface ChatWelcomeProps {
  status: ChatStatus;
  selectedChatModel: string;
  composerValue: string;
  onComposerValueChange: (value: string) => void;
  onSelectedChatModelChange: (modelId: string) => void;
  onSubmit: (message: { text: string; files: FileUIPart[] }) => void;
  onStop: () => void;
  messageQuota?: MessageQuotaStatus | null;
}

export function ChatWelcome({
  status,
  selectedChatModel,
  composerValue,
  onComposerValueChange,
  onSelectedChatModelChange,
  onSubmit,
  onStop,
  messageQuota,
}: ChatWelcomeProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  const filteredTemplates = useMemo(
    () => AUTOMATION_TEMPLATES.filter((t) => t.category === activeCategory),
    [activeCategory],
  );

  const handleTemplateClick = useCallback(
    (template: AutomationTemplate) => {
      onComposerValueChange(template.prompt);
    },
    [onComposerValueChange],
  );

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 pt-[8vh] pb-8">
      <div className="w-full max-w-[780px] space-y-8">
        {/* Hero heading */}
        <h1 className="text-center text-[2.5rem] leading-tight font-bold tracking-tight text-foreground">
          What can I do for you?
        </h1>

        {/* Centered composer */}
        <ChatComposer
          status={status}
          selectedChatModel={selectedChatModel}
          value={composerValue}
          onValueChange={onComposerValueChange}
          onSelectedChatModelChange={onSelectedChatModelChange}
          onSubmit={onSubmit}
          onStop={onStop}
          messageQuota={messageQuota}
          className="px-0 pb-0"
          innerClassName="max-w-none"
          placeholder="Describe a task or responsibility"
        />

        {/* Template section */}
        <div className="space-y-5">
          {/* Category tabs */}
          <div className="flex items-center justify-center gap-6">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "text-sm font-medium transition-colors",
                  activeCategory === category
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>

          {/* Template cards grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={handleTemplateClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single template suggestion card with title, description, and "Try it" action. */
function TemplateCard({
  template,
  onClick,
}: {
  template: AutomationTemplate;
  onClick: (template: AutomationTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(template)}
      className="flex flex-col items-start rounded-xl border border-border/50 bg-card p-5 text-left transition-colors hover:border-border hover:bg-accent/30"
    >
      <span className="text-sm font-semibold text-foreground">
        {template.title}
      </span>
      <span className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
        {template.description}
      </span>
      <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        Try it
      </span>
    </button>
  );
}
