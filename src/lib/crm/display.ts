/**
 * Shared CRM display helpers for badges and formatting.
 * @module lib/crm/display
 */
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import type { CustomFieldDefinition } from "@/lib/crm/config";
import type { Contact, Deal } from "@/lib/crm/schemas";
import {
  AVATAR_COLORS,
  DEAL_STAGE_TONE_CLASSES,
  DEAL_STAGE_TOP_BORDER_CLASSES,
  TASK_STATUS_TONE_CLASSES,
  TASK_STATUS_TOP_BORDER_CLASSES,
} from "@/lib/ui/color-maps";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Badge variants for contact type chips across CRM table/detail surfaces. */
export const contactTypeBadgeVariantMap: Record<Contact["type"], BadgeVariant> = {
  buyer: "info",
  seller: "success",
  landlord: "warning",
  tenant: "secondary",
  agent: "outline",
  other: "secondary",
};

/** Returns a safe badge variant for configured or default contact types. */
export function getContactTypeBadgeVariant(type: Contact["type"]): BadgeVariant {
  return contactTypeBadgeVariantMap[type] ?? "secondary";
}

/** Badge variants for default company industries used in CRM company surfaces. */
export const companyIndustryBadgeVariantMap = {
  property_agency: "info",
  developer: "warning",
  law_firm: "outline",
  bank: "success",
  government: "secondary",
  other: "secondary",
} as const satisfies Record<string, BadgeVariant>;

/** Returns a safe badge variant for configured or default company industries. */
export function getCompanyIndustryBadgeVariant(industry: string): BadgeVariant {
  return companyIndustryBadgeVariantMap[industry as keyof typeof companyIndustryBadgeVariantMap] ?? "secondary";
}

/** Badge variants for deal stages used in the linked deals table. */
export const dealStageBadgeVariantMap: Record<Deal["stage"], BadgeVariant> = {
  leads: "secondary",
  negotiation: "info",
  offer: "warning",
  closing: "success",
  lost: "destructive",
};

const defaultDealStageLabelMap = {
  leads: "Leads",
  negotiation: "Negotiation",
  offer: "Offer",
  closing: "Closing",
  lost: "Lost",
} as const;

/** Formats default or configured deal stages with a safe fallback. */
export function formatDealStageLabel(stage: Deal["stage"]): string {
  return defaultDealStageLabelMap[stage as keyof typeof defaultDealStageLabelMap]
    ?? formatCrmEnumLabel(stage);
}

/** Formats an ISO timestamp as `2 Mar 2026`. Empty value renders as blank. */
export function formatCrmDate(dateString: string | null): string {
  if (!dateString) {
    return "";
  }

  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formats an ISO timestamp as `2 Mar 2026, 10:30`. */
export function formatCrmDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sgdFormatter = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
});

/** Formats a deal price as Singapore dollars with no decimals. Empty value renders as blank. */
export function formatCrmPrice(price: number | null): string {
  if (price === null) {
    return "";
  }

  return sgdFormatter.format(price);
}

/** Returns a normalized full name for a contact. */
export function formatContactFullName(contact: Pick<Contact, "first_name" | "last_name">): string {
  return `${contact.first_name} ${contact.last_name}`.trim();
}

/** Formats CRM enum-like values such as `hot_lead` into `Hot Lead`. */
export function formatCrmEnumLabel(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return value;
  }

  return trimmed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Builds select options while preserving a current out-of-config value if needed. */
export function buildCrmSelectOptions(values: readonly string[], currentValue?: string | null) {
  const nextValues = currentValue && !values.includes(currentValue)
    ? [...values, currentValue]
    : values;

  return nextValues.map((value) => ({
    value,
    label: formatCrmEnumLabel(value),
  }));
}

/** Formats a stored custom-field value for `InlineEditField`. */
export function formatCustomFieldValue(
  type: CustomFieldDefinition["type"],
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if ((type === "number" || type === "currency") && typeof value !== "number") {
    return String(value).trim();
  }

  if (type === "boolean" && typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

/** Parses inline-edit custom-field input back into the stored JSONB value. */
export function parseCustomFieldInputValue(
  type: CustomFieldDefinition["type"],
  value: string,
) {
  if (type === "number" || type === "currency") {
    const normalizedValue = value.replace(/[^\d.-]/g, "");

    if (!normalizedValue) {
      return null;
    }

    const parsedValue = Number(normalizedValue);
    if (Number.isNaN(parsedValue)) {
      throw new Error("Value must be a valid number.");
    }

    return parsedValue;
  }

  if (type === "boolean") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue.length === 0) {
      return null;
    }

    if (["true", "yes", "1"].includes(normalizedValue)) {
      return true;
    }

    if (["false", "no", "0"].includes(normalizedValue)) {
      return false;
    }

    throw new Error("Value must be true or false.");
  }

  return toNullableValue(value);
}

/** Converts a string to `null` when empty/whitespace-only — used by CRM inline edit fields. */
export function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Formats a number as compact currency shorthand (e.g. "$1.8M", "$950K"). */
export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }
  return `$${value}`;
}

/** Kanban chip background/text classes per deal stage. */
export const dealStageToneClassMap = DEAL_STAGE_TONE_CLASSES;

/** Returns a safe kanban tone class for default or configured deal stages. */
export function getDealStageToneClass(stage: Deal["stage"]): string {
  return dealStageToneClassMap[stage as keyof typeof dealStageToneClassMap]
    ?? "bg-muted text-foreground/80";
}

/** Kanban column top-border classes per deal stage. */
export const dealStageTopBorderMap = DEAL_STAGE_TOP_BORDER_CLASSES;

/** Returns a safe kanban border class for default or configured deal stages. */
export function getDealStageTopBorderClass(stage: Deal["stage"]): string {
  return dealStageTopBorderMap[stage as keyof typeof dealStageTopBorderMap]
    ?? "border-t-border";
}

/** Kanban chip background/text classes per task status. */
export const taskStatusToneClassMap = TASK_STATUS_TONE_CLASSES;

/** Kanban column top-border classes per task status. */
export const taskStatusTopBorderMap = TASK_STATUS_TOP_BORDER_CLASSES;

/** Returns a deterministic avatar color class (bg + text) from a string hash. */
export function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Soft-tinted pill classes for CRM list-table select/tag cells. Matches
 * Attio's pale category pills while staying on Flexoki Layer 3 tokens
 * (no raw Tailwind palette classes). Deterministic per value so the same
 * tag always gets the same color across renders.
 */
const TAG_TONE_CLASSES = [
  "bg-stage-leads/15 text-stage-leads",
  "bg-stage-negotiation/15 text-stage-negotiation",
  "bg-stage-offer/15 text-stage-offer",
  "bg-stage-closing/15 text-stage-closing",
  "bg-status-todo/15 text-status-todo",
  "bg-status-in-progress/15 text-status-in-progress",
  "bg-filetype-presentation/15 text-filetype-presentation",
  "bg-filetype-document/15 text-filetype-document",
] as const;

/** Returns a deterministic pill tint class for a tag/select value. */
export function tagColorFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return TAG_TONE_CLASSES[Math.abs(hash) % TAG_TONE_CLASSES.length]!;
}

export { DEAL_STAGE_LEFT_BORDER_CLASSES } from "@/lib/ui/color-maps";
