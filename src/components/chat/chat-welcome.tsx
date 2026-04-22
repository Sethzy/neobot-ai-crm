/**
 * Welcome screen shown when a chat thread has no messages.
 * Displays a hero heading, centered composer, and categorized template cards.
 * Replicates the Tasklet-style landing page for new conversations.
 * @module components/chat/chat-welcome
 */
"use client";

import type { FileUIPart } from "ai";
import { useCallback, useMemo, useState } from "react";

import type { MessageQuotaStatus } from "@/lib/usage/message-quota";
import { cn } from "@/lib/utils";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/lib/automations/templates";
import type { ChatStatus } from "@/types/chat";

import { ChatComposer } from "./chat-composer";
import { MessageQuotaPill } from "./message-quota-pill";

/** Tab labels mapped from template category IDs. */
const CATEGORY_LABELS: Record<AutomationTemplate["category"], string> = {
  sales: "Sales",
  operations: "Operations",
  research: "Research",
  marketing: "Marketing",
};

/** Flexoki accent colors per category for tab underlines. */
const CATEGORY_COLORS: Record<AutomationTemplate["category"], string> = {
  sales: "var(--flexoki-green)",
  operations: "var(--flexoki-blue)",
  research: "var(--flexoki-purple)",
  marketing: "var(--flexoki-orange)",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<AutomationTemplate["category"]>;

interface ChatWelcomeProps {
  status: ChatStatus;
  selectedChatModel: string;
  composerValue: string;
  onComposerValueChange: (value: string) => void;
  onSelectedChatModelChange: (modelId: string) => void;
  onSubmit: (message: { text: string; files: FileUIPart[] }) => void;
  onStop?: () => void;
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
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 pt-24 pb-8">
      <div className="w-full max-w-[780px]">
        <h1 className="type-hero-title text-center text-foreground">
          What can I do for you?
        </h1>

        {/* Quota pill */}
        {messageQuota ? (
          <div className="mt-4">
            <MessageQuotaPill quota={messageQuota} />
          </div>
        ) : null}

        {/* Centered composer — the hero action */}
        <div className="mt-10">
          <ChatComposer
            status={status}
            selectedChatModel={selectedChatModel}
            value={composerValue}
            onValueChange={onComposerValueChange}
            onSelectedChatModelChange={onSelectedChatModelChange}
            onSubmit={onSubmit}
            onStop={onStop}
            disabled={(messageQuota?.messagesRemaining ?? 1) <= 0}
            className="px-0 pb-0"
            innerClassName="max-w-none"
            placeholder="Describe a task or responsibility"
          />
        </div>

        {/* Template section — generous separation from composer */}
        <div className="mt-12">
          {/* Category tabs with underline indicator */}
          <div className="flex items-center justify-center gap-6 border-b border-border/40">
            {CATEGORIES.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    "-mb-px border-b-2 py-2.5 type-control transition-all",
                    isActive
                      ? "text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  style={{ borderColor: isActive ? CATEGORY_COLORS[category] : "transparent" }}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              );
            })}
          </div>

          {/* Template cards grid */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      className="flex flex-col items-start rounded-lg p-4 text-left transition-colors hover:bg-accent/40"
    >
      <span className="type-row-title text-foreground">
        {template.title}
      </span>
      <span className="mt-1.5 flex-1 text-meta leading-relaxed text-muted-foreground">
        {template.description}
      </span>
    </button>
  );
}
