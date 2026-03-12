/**
 * Shared CRM dictionary-style value renderer for visual parity with Open Mercato.
 * @module components/crm/dictionary-value
 */
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Calendar,
  Circle,
  Flag,
  Globe,
  Handshake,
  Home,
  Megaphone,
  Phone,
  Sparkles,
  Target,
  ThumbsUp,
  Trophy,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

import { formatCrmEnumLabel } from "@/lib/crm/display";
import { cn } from "@/lib/utils";

export interface DictionaryDisplayEntry {
  label: string;
  color?: string | null;
  icon?: string | null;
}

export type DictionaryMap = Record<string, DictionaryDisplayEntry>;

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  building2: Building2,
  calendar: Calendar,
  circle: Circle,
  flag: Flag,
  globe: Globe,
  handshake: Handshake,
  home: Home,
  megaphone: Megaphone,
  phone: Phone,
  sparkles: Sparkles,
  target: Target,
  "thumbs-up": ThumbsUp,
  trophy: Trophy,
  "user-check": UserCheck,
  users: Users,
  zap: Zap,
};

const defaultWrapperClassName = "inline-flex items-center gap-2";
const defaultIconWrapperClassName = "inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card";
const defaultIconClassName = "h-4 w-4";
const defaultColorClassName = "h-3 w-3 rounded-full";

export const contactTypeDictionaryMap = {
  buyer: {
    label: "Buyer",
    color: "#3b82f6",
    icon: "lucide:users",
  },
  seller: {
    label: "Seller",
    color: "#10b981",
    icon: "lucide:briefcase",
  },
  landlord: {
    label: "Landlord",
    color: "#f97316",
    icon: "lucide:building2",
  },
  tenant: {
    label: "Tenant",
    color: "#8b5cf6",
    icon: "lucide:home",
  },
  agent: {
    label: "Agent",
    color: "#14b8a6",
    icon: "lucide:handshake",
  },
  other: {
    label: "Other",
    color: "#6b7280",
    icon: "lucide:circle",
  },
} as const satisfies DictionaryMap;

export const dealStageDictionaryMap = {
  leads: {
    label: "Leads",
    color: "#f97316",
    icon: "lucide:sparkles",
  },
  negotiation: {
    label: "Negotiation",
    color: "#eab308",
    icon: "lucide:handshake",
  },
  offer: {
    label: "Offer",
    color: "#8b5cf6",
    icon: "lucide:target",
  },
  closing: {
    label: "Closing",
    color: "#10b981",
    icon: "lucide:trophy",
  },
  lost: {
    label: "Lost",
    color: "#ef4444",
    icon: "lucide:flag",
  },
} as const satisfies DictionaryMap;

export const crmStatusDictionaryMap = {
  active: {
    label: "Active",
    color: "#3b82f6",
    icon: "lucide:users",
  },
  inactive: {
    label: "Inactive",
    color: "#6b7280",
    icon: "lucide:user-check",
  },
  open: {
    label: "Open",
    color: "#3b82f6",
    icon: "lucide:circle",
  },
  in_progress: {
    label: "In progress",
    color: "#f97316",
    icon: "lucide:zap",
  },
  won: {
    label: "Won",
    color: "#10b981",
    icon: "lucide:trophy",
  },
  lost: {
    label: "Lost",
    color: "#ef4444",
    icon: "lucide:flag",
  },
} as const satisfies DictionaryMap;

export const crmLifecycleStageDictionaryMap = {
  prospect: {
    label: "Prospect",
    color: "#f97316",
    icon: "lucide:sparkles",
  },
  customer: {
    label: "Customer",
    color: "#10b981",
    icon: "lucide:briefcase",
  },
  lead: {
    label: "Lead",
    color: "#eab308",
    icon: "lucide:target",
  },
  opportunity: {
    label: "Opportunity",
    color: "#8b5cf6",
    icon: "lucide:trophy",
  },
} as const satisfies DictionaryMap;

export const crmSourceDictionaryMap = {
  customer_referral: {
    label: "Customer referral",
    color: "#10b981",
    icon: "lucide:thumbs-up",
  },
  partner_referral: {
    label: "Partner referral",
    color: "#3b82f6",
    icon: "lucide:handshake",
  },
  industry_event: {
    label: "Industry event",
    color: "#f97316",
    icon: "lucide:calendar",
  },
  outbound_campaign: {
    label: "Outbound campaign",
    color: "#eab308",
    icon: "lucide:megaphone",
  },
  website: {
    label: "Website",
    color: "#6366f1",
    icon: "lucide:globe",
  },
  direct: {
    label: "Direct",
    color: "#14b8a6",
    icon: "lucide:phone",
  },
} as const satisfies DictionaryMap;

export function renderDictionaryIcon(icon: string | null | undefined, className = defaultIconClassName): ReactNode {
  if (!icon) {
    return null;
  }

  if (!icon.startsWith("lucide:")) {
    return <span className="text-base">{icon}</span>;
  }

  const iconName = icon.slice("lucide:".length);
  const Icon = LUCIDE_ICON_MAP[iconName];

  if (!Icon) {
    return null;
  }

  return <Icon className={className} aria-hidden="true" />;
}

export function renderDictionaryColor(color: string | null | undefined, className = defaultColorClassName): ReactNode {
  if (!color) {
    return null;
  }

  return (
    <span
      className={cn("inline-flex border border-border", className)}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

interface DictionaryValueProps {
  value: string | null | undefined;
  map: DictionaryMap;
  fallback?: ReactNode;
  className?: string;
  iconWrapperClassName?: string;
  iconClassName?: string;
  colorClassName?: string;
}

/**
 * Renders a Mercato-style CRM value with an icon tile, label text, and color dot.
 */
export function DictionaryValue({
  value,
  map,
  fallback,
  className,
  iconWrapperClassName = defaultIconWrapperClassName,
  iconClassName = defaultIconClassName,
  colorClassName = defaultColorClassName,
}: DictionaryValueProps) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallback ?? <span className="text-muted-foreground">—</span>;
  }

  const entry = map[normalizedValue];

  if (!entry) {
    return fallback ?? <span>{formatCrmEnumLabel(normalizedValue)}</span>;
  }

  const renderedIcon = renderDictionaryIcon(entry.icon, iconClassName);

  return (
    <span className={cn(defaultWrapperClassName, className)}>
      {renderedIcon ? (
        <span className={iconWrapperClassName}>
          {renderedIcon}
        </span>
      ) : null}
      <span>{entry.label}</span>
      {entry.color ? renderDictionaryColor(entry.color, colorClassName) : null}
    </span>
  );
}
