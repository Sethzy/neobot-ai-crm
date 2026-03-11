/**
 * Explicit board-stage control for deal cards.
 * @module components/crm/deal-stage-menu
 */
"use client";

import { cn } from "@/lib/utils";
import { formatDealStageLabel } from "@/lib/crm/display";
import type { Deal } from "@/lib/crm/schemas";
import { useState } from "react";

interface DealStageMenuProps {
  /** Current persisted deal stage. */
  currentStage: string;
  /** Ordered list of available stage ids. */
  stages: string[];
  /** Called when the user chooses a different stage. */
  onChange: (stage: string) => Promise<void> | void;
}

export function DealStageMenu({ currentStage, stages, onChange }: DealStageMenuProps) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="sr-only">Deal stage</span>
        <select
          aria-label="Deal stage"
          className={cn(
            "h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow]",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          )}
          value={currentStage}
          disabled={isSaving}
          onClick={(event) => event.stopPropagation()}
          onChange={async (event) => {
            const nextStage = event.target.value;

            if (nextStage === currentStage || isSaving) {
              return;
            }

            setIsSaving(true);

            try {
              await onChange(nextStage);
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {formatDealStageLabel(stage as Deal["stage"])}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
