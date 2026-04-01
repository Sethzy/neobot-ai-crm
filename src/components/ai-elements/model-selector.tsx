/**
 * @fileoverview Popover-based chat model selector for the main /chat composer.
 */
"use client";

import { useMemo, useState } from "react";

import { Check, ChevronDown } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { chatModels, resolveModelId } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: string;
  onValueChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedModel = useMemo(
    () => chatModels.find((model) => model.id === resolveModelId(value)) ?? chatModels[0],
    [value],
  );

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
          <span className="truncate">{selectedModel.name}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-1.5">
        <PopoverHeader className="px-2 py-1">
          <PopoverTitle>Choose model</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-1">
          {chatModels.map((model) => {
            const isSelected = model.id === selectedModel.id;

            return (
              <button
                aria-pressed={isSelected}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                key={model.id}
                onClick={() => {
                  onValueChange(model.id);
                  setOpen(false);
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {model.name}
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
                    "mt-0.5 size-4 shrink-0 text-primary",
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
