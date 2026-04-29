/**
 * @fileoverview Popover-based chat model selector for the main /chat composer.
 */
"use client";

import { useMemo, useState } from "react";

import { Check, ChevronDown, Lock } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { chatModels, resolveModelId } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: string;
  onValueChange: (modelId: string) => void;
  disabled?: boolean;
  /**
   * When true, the picker renders as a non-interactive pill showing the
   * locked model. Used on existing-thread pages where `chat_model` is
   * pinned to the row at thread create time and can't be swapped.
   */
  locked?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  disabled = false,
  locked = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedModel = useMemo(
    () => chatModels.find((model) => model.id === resolveModelId(value)) ?? chatModels[0],
    [value],
  );

  // When the catalog only contains one model there's nothing to pick —
  // render a plain non-interactive label so we don't ship a dropdown
  // with a single entry. The popover branch below is restored
  // automatically the moment a second model is added to `chatModels`.
  if (chatModels.length <= 1) {
    return (
      <span
        aria-label={selectedModel.name}
        className="inline-flex items-center gap-1.5 px-2 text-sm text-muted-foreground"
      >
        <span className="truncate text-foreground">{selectedModel.name}</span>
        <span className="text-xs">{"$".repeat(selectedModel.cost)}</span>
      </span>
    );
  }

  // Locked: render the same Button shape as the popover trigger so the
  // composer layout doesn't shift, but disable interaction and swap the
  // chevron for a lock icon. Tooltip-equivalent hint via `title`.
  if (locked) {
    return (
      <Button
        aria-label={`${selectedModel.name} (locked to this thread)`}
        className="max-w-full justify-between gap-2"
        disabled
        size="sm"
        title="Locked to this thread. Start a new chat to switch models."
        type="button"
        variant="ghost"
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedModel.tier}
          <span className="text-xs text-muted-foreground">{"$".repeat(selectedModel.cost)}</span>
        </span>
        <Lock className="size-3.5 shrink-0 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={selectedModel.name}
          className="max-w-full justify-between gap-2"
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="flex items-center gap-1.5 truncate">
            {selectedModel.tier}
            <span className="text-xs text-muted-foreground">{"$".repeat(selectedModel.cost)}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-1.5">
        <div className="divide-y divide-border">
          {chatModels.map((model) => {
            const isSelected = model.id === selectedModel.id;

            return (
              <button
                aria-pressed={isSelected}
                className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted first:rounded-t-md last:rounded-b-md"
                key={model.id}
                onClick={() => {
                  onValueChange(model.id);
                  setOpen(false);
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {model.tier}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {model.shortName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {"$".repeat(model.cost)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {model.description}
                  </span>
                </span>

                <Check
                  className={cn(
                    "mt-1 size-4 shrink-0 text-muted-foreground",
                    !isSelected && "invisible",
                  )}
                />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
