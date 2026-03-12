/**
 * Declarative responsive grid for inline-editable CRM detail fields.
 * @module components/crm/detail/detail-fields-section
 */
"use client";

import type { ReactNode } from "react";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface BaseFieldConfig {
  key: string;
  gridClassName?: string;
}

interface EditableFieldConfig extends BaseFieldConfig {
  kind?: "editable";
  label: string;
  value: string | null;
  displayValue?: string | null;
  type?: "text" | "textarea" | "select" | "date" | "number";
  inputType?: React.HTMLInputTypeAttribute;
  options?: SelectOption[];
  onSave: (value: string) => Promise<void> | void;
}

interface CustomFieldConfig extends BaseFieldConfig {
  kind: "custom";
  render: () => ReactNode;
}

export type DetailFieldConfig = EditableFieldConfig | CustomFieldConfig;

interface DetailFieldsSectionProps {
  fields: DetailFieldConfig[];
  className?: string;
}

/**
 * Renders each field inside the subdued card chrome used across the Open Mercato detail pages.
 */
export function DetailFieldsSection({
  fields,
  className,
}: DetailFieldsSectionProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3", className)}>
      {fields.map((field) => (
        <div
          key={field.key}
          className={cn("rounded-lg border border-border/40 bg-muted/30 p-3 shadow-sm", field.gridClassName)}
        >
          {field.kind === "custom" ? (
            field.render()
          ) : (
            <InlineEditField
              label={field.label}
              value={field.value}
              displayValue={field.displayValue}
              type={field.type}
              inputType={field.inputType}
              options={field.options}
              onSave={field.onSave}
            />
          )}
        </div>
      ))}
    </div>
  );
}
