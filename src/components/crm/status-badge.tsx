/**
 * Entity-agnostic status badge primitive.
 * @module components/crm/status-badge
 */
import type { VariantProps } from "class-variance-authority";

import { Badge, badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface StatusBadgeProps<TValue extends string> {
  label: string;
  value: TValue;
  variantMap: Partial<Record<TValue, BadgeVariant>>;
}

/**
 * Renders a badge with a label and variant chosen from a caller-provided map.
 */
export function StatusBadge<TValue extends string>({
  label,
  value,
  variantMap,
}: StatusBadgeProps<TValue>) {
  return <Badge variant={variantMap[value] ?? "secondary"}>{label}</Badge>;
}
