/**
 * Horizontal pill tab bar for switching between saved CRM views.
 * @module components/crm/view-picker
 */
"use client";

import { useCrmViews } from "@/hooks/use-crm-views";
import type { CrmViewEntityType } from "@/lib/crm/schemas";
import { cn } from "@/lib/utils";

interface ViewPickerProps {
  entityType: CrmViewEntityType;
  activeViewId: string | null;
  onViewChange: (viewId: string | null) => void;
}

export function ViewPicker({ entityType, activeViewId, onViewChange }: ViewPickerProps) {
  const { data: views, isLoading } = useCrmViews(entityType);

  if (isLoading) {
    return null;
  }

  const savedViews = views ?? [];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      <PillButton
        label="All"
        isActive={activeViewId === null}
        onClick={() => onViewChange(null)}
      />
      {savedViews.map((view) => (
        <PillButton
          key={view.view_id}
          label={view.name}
          isActive={activeViewId === view.view_id}
          onClick={() => onViewChange(view.view_id)}
        />
      ))}
    </div>
  );
}

function PillButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={isActive}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
        "border border-transparent",
        isActive
          ? "bg-tx-2/10 text-tx border-bd"
          : "text-tx-2 hover:bg-ui-2 hover:text-tx",
      )}
    >
      {label}
    </button>
  );
}
