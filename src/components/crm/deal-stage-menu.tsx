/**
 * Explicit board-stage control for deal cards.
 * @module components/crm/deal-stage-menu
 */
"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
      <NativeSelect
        aria-label="Deal stage"
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
          <NativeSelectOption key={stage} value={stage}>
            {formatDealStageLabel(stage as Deal["stage"])}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
