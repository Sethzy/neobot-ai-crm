/**
 * Shared inline editors for CRM record-drawer custom fields.
 * @module components/crm/record-drawer/custom-field-editors
 */
"use client";

import type { CustomFieldDefinition } from "@/lib/crm/config";
import {
  buildCrmSelectOptions,
  formatCustomFieldValue,
} from "@/lib/crm/display";

import { InlineEditField } from "@/components/crm/inline-edit-field";

interface CustomFieldEditorsProps {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown> | null | undefined;
  onSaveField: (definition: CustomFieldDefinition, nextValue: string) => Promise<void>;
}

function toInlineEditType(type: CustomFieldDefinition["type"]) {
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
 * Renders one `InlineEditField` per configured custom field definition.
 */
export function CustomFieldEditors({
  definitions,
  values,
  onSaveField,
}: CustomFieldEditorsProps) {
  return (
    <div className="space-y-0.5">
      {definitions.map((definition) => {
        const currentValue = formatCustomFieldValue(
          definition.type,
          values?.[definition.key],
        );

        return (
          <InlineEditField
            key={definition.key}
            label={definition.label}
            value={currentValue}
            type={toInlineEditType(definition.type)}
            options={definition.type === "select"
              ? buildCrmSelectOptions(definition.options ?? [], currentValue)
              : undefined}
            onSave={(nextValue) => onSaveField(definition, nextValue)}
          />
        );
      })}
    </div>
  );
}
