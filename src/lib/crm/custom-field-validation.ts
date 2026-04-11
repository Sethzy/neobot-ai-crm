/**
 * Runtime validators for CRM custom field values.
 * @module lib/crm/custom-field-validation
 */
import type { CustomFieldDefinition } from "./config";

export type CustomFieldValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates provided custom field values against known definitions.
 * Unknown keys are allowed and ignored.
 */
export function validateCustomFields(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
): CustomFieldValidationResult {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));

  for (const [key, value] of Object.entries(values)) {
    const definition = definitionsByKey.get(key);
    if (!definition || value === null || value === undefined) {
      continue;
    }

    switch (definition.type) {
      case "select": {
        const options = definition.options ?? [];
        if (typeof value !== "string" || !options.includes(value)) {
          return {
            ok: false,
            error:
              `Invalid value for "${definition.label}" (${definition.key}): ` +
              `"${String(value)}". Valid options: ${options.join(", ")}`,
          };
        }
        break;
      }
      case "number":
      case "currency": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return {
            ok: false,
            error: `Invalid value for "${definition.label}" (${definition.key}): must be a finite number`,
          };
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          return {
            ok: false,
            error: `Invalid value for "${definition.label}" (${definition.key}): must be a parseable date string`,
          };
        }
        break;
      }
      case "text":
      default: {
        if (typeof value !== "string") {
          return {
            ok: false,
            error: `Invalid value for "${definition.label}" (${definition.key}): must be a string`,
          };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Ensures all required custom field definitions are present with non-empty values.
 */
export function checkRequiredCustomFields(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
): CustomFieldValidationResult {
  const missing = definitions
    .filter((definition) => definition.required)
    .filter((definition) => {
      const value = values[definition.key];
      return value === null || value === undefined || value === "";
    })
    .map((definition) => `${definition.label} (${definition.key})`);

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Required custom fields missing: ${missing.join(", ")}`,
    };
  }

  return { ok: true };
}
