/**
 * Shared CRM display helpers for badges and formatting.
 * @module lib/crm/display
 */
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import type { Contact, Deal } from "@/lib/crm/schemas";

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

/** Badge variants for deal stages used in the linked deals table. */
export const dealStageBadgeVariantMap: Record<Deal["stage"], BadgeVariant> = {
  leads: "secondary",
  viewing: "info",
  offer: "warning",
  negotiation: "warning",
  otp: "success",
  completion: "success",
  lost: "destructive",
};

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

/** Formats a deal price as Singapore dollars with no decimals. */
export function formatCrmPrice(price: number | null): string {
  if (price === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(price);
}

/** Returns a normalized full name for a contact. */
export function formatContactFullName(contact: Pick<Contact, "first_name" | "last_name">): string {
  return `${contact.first_name} ${contact.last_name}`.trim();
}
