/**
 * Custom-field section for customer detail pages.
 * @module components/crm/detail/custom-data-section
 */
"use client";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import type { CustomFieldDefinition } from "@/lib/crm/config";
import {
  buildCrmSelectOptions,
  formatCustomFieldValue,
  parseCustomFieldInputValue,
} from "@/lib/crm/display";

interface CustomDataSectionProps {
  title?: string;
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown> | null | undefined;
  onSaveField: (definition: CustomFieldDefinition, nextValue: string) => Promise<void>;
}

function resolveFieldType(type: CustomFieldDefinition["type"]) {
  if (type === "select") {
    return "select" as const;
  }

  if (type === "date") {
    return "date" as const;
  }

  if (type === "number" || type === "currency") {
    return "number" as const;
  }

  return "text" as const;
}

/**
 * Renders configured custom fields in the same responsive grid as the core detail fields.
 */
export function CustomDataSection({
  title = "Custom Fields",
  definitions,
  values,
  onSaveField,
}: CustomDataSectionProps) {
  if (definitions.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {definitions.map((definition) => {
          const currentValue = formatCustomFieldValue(definition.type, values?.[definition.key]);

          return (
            <div
              key={definition.key}
              className="rounded-lg border border-border/40 bg-muted/30 p-3 shadow-sm"
            >
              <InlineEditField
                label={definition.label}
                value={currentValue}
                type={resolveFieldType(definition.type)}
                options={definition.type === "select"
                  ? buildCrmSelectOptions(definition.options ?? [], currentValue)
                  : undefined}
                onSave={async (nextValue) => {
                  await onSaveField(
                    definition,
                    nextValue,
                  );
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { parseCustomFieldInputValue };
