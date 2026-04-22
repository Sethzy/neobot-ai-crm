/**
 * Stable action identifiers that require explicit user approval.
 *
 * @module lib/managed-agents/gated-action-types
 */

export const GATED_ACTION_TYPES = [
  "crm.delete_records",
  "crm.configure_crm",
] as const;

export type GatedActionType = (typeof GATED_ACTION_TYPES)[number];

export function isGatedActionType(value: string): value is GatedActionType {
  return (GATED_ACTION_TYPES as readonly string[]).includes(value);
}
