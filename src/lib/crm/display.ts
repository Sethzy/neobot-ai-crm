/**
 * Shared CRM display helpers for badges and formatting.
 * @module lib/crm/display
 */
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import type { CustomFieldDefinition } from "@/lib/crm/config";
import type { Contact, CrmTask, Deal } from "@/lib/crm/schemas";
import { crmTaskStatusValues, dealStageValues } from "@/lib/crm/schemas";

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
  return companyIndustryBadgeVariantMap[industry] ?? "secondary";
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

/** Formats an ISO timestamp as `2 Mar 2026`. */
export function formatCrmDate(dateString: string | null): string {
  if (!dateString) {
    return "—";
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

/** Formats a deal price as Singapore dollars with no decimals. */
export function formatCrmPrice(price: number | null): string {
  if (price === null) {
    return "—";
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

  if (type === "number" || type === "currency") {
    return typeof value === "number" ? String(value) : String(value).trim();
  }

  if (type === "date" || type === "select" || type === "text") {
    return String(value);
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
export const dealStageToneClassMap: Record<(typeof dealStageValues)[number], string> = {
  leads: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  negotiation: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  offer: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  closing: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  lost: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

/** Returns a safe kanban tone class for default or configured deal stages. */
export function getDealStageToneClass(stage: Deal["stage"]): string {
  return dealStageToneClassMap[stage as keyof typeof dealStageToneClassMap]
    ?? "bg-muted text-foreground/80";
}

/** Kanban column top-border classes per deal stage. */
export const dealStageTopBorderMap: Record<(typeof dealStageValues)[number], string> = {
  leads: "border-t-amber-400",
  negotiation: "border-t-orange-400",
  offer: "border-t-violet-400",
  closing: "border-t-emerald-400",
  lost: "border-t-rose-400",
};

/** Returns a safe kanban border class for default or configured deal stages. */
export function getDealStageTopBorderClass(stage: Deal["stage"]): string {
  return dealStageTopBorderMap[stage as keyof typeof dealStageTopBorderMap]
    ?? "border-t-border";
}

/** Kanban chip background/text classes per task status. */
export const taskStatusToneClassMap: Record<(typeof crmTaskStatusValues)[number], string> = {
  open: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

/** Kanban column top-border classes per task status. */
export const taskStatusTopBorderMap: Record<(typeof crmTaskStatusValues)[number], string> = {
  open: "border-t-sky-400",
  completed: "border-t-emerald-400",
};

/** Deterministic color palette for avatar initials in kanban cards. */
const AVATAR_COLORS = [
  "bg-amber-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
];

/** Returns a deterministic Tailwind background color class from a string hash. */
export function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
