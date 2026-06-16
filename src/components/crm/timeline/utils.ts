/**
 * Timeline rendering helpers for audit and interaction rows.
 * @module components/crm/timeline/utils
 */
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Building2,
  CalendarClock,
  Kanban,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  Tag,
  Text,
  UserRound,
} from "lucide-react";

import type {
  TimelineActivity,
  TimelineActivityProperties,
  TimelineRecordType,
  UnifiedTimelineEntry,
  UnifiedTimelineInteraction,
} from "@/lib/crm/schemas";

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const fieldLabelMap: Record<string, string> = {
  address: "Address",
  amount: "Amount",
  company_id: "Company",
  description: "Description",
  due_date: "Due Date",
  email: "Email",
  name: "Name",
  notes: "Notes",
  phone: "Phone",
  stage: "Stage",
  status: "Status",
  title: "Title",
  type: "Type",
};

const fieldIconMap: Record<string, LucideIcon> = {
  address: MapPin,
  amount: Banknote,
  company_id: Building2,
  description: Text,
  due_date: CalendarClock,
  email: Mail,
  name: Building2,
  notes: StickyNote,
  phone: Phone,
  stage: Kanban,
  status: Tag,
  title: Text,
  type: UserRound,
};

export interface TimelineMonthGroupData {
  label: string;
  entries: UnifiedTimelineEntry[];
}

export interface TimelineFieldDiffData {
  fieldKey: string;
  label: string;
  beforeValue: string;
  afterValue: string;
  Icon: LucideIcon;
}

export function groupTimelineEntriesByMonth(entries: UnifiedTimelineEntry[]): TimelineMonthGroupData[] {
  const groups = new Map<string, UnifiedTimelineEntry[]>();

  for (const entry of entries) {
    const label = monthFormatter.format(new Date(entry.timestamp));
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  return Array.from(groups.entries()).map(([label, monthEntries]) => ({
    label,
    entries: monthEntries,
  }));
}

export function getTimelineActorLabel(
  actorType: TimelineActivity["actor_type"],
  actorLabel: string | null,
): string {
  if (actorType === "user") {
    return "You";
  }

  if (actorLabel?.trim()) {
    return actorLabel;
  }

  return actorType === "agent" ? "NeoBot" : "System";
}

export function getAuditAction(activity: TimelineActivity): "created" | "updated" | "deleted" | null {
  if (activity.name.endsWith(".created")) {
    return "created";
  }

  if (activity.name.endsWith(".updated")) {
    return "updated";
  }

  if (activity.name.endsWith(".deleted")) {
    return "deleted";
  }

  return null;
}

export function getRecordSnapshot(
  activity: TimelineActivity,
): Record<string, unknown> | undefined {
  const properties = activity.properties as TimelineActivityProperties | null;

  return (properties?.after ?? properties?.before) as Record<string, unknown> | undefined;
}

export function getRecordLabel(
  recordType: TimelineRecordType,
  record: Record<string, unknown> | undefined,
): string {
  if (!record) {
    return recordType.charAt(0).toUpperCase() + recordType.slice(1);
  }

  if (recordType === "contact") {
    const firstName = typeof record.first_name === "string" ? record.first_name : "";
    const lastName = typeof record.last_name === "string" ? record.last_name : "";
    return `${firstName} ${lastName}`.trim() || "Contact";
  }

  if (recordType === "company") {
    return typeof record.name === "string" && record.name.trim() ? record.name : "Company";
  }

  if (recordType === "deal") {
    return typeof record.address === "string" && record.address.trim() ? record.address : "Deal";
  }

  return typeof record.title === "string" && record.title.trim() ? record.title : "Task";
}

export function getTimelineFieldDiffs(activity: TimelineActivity): TimelineFieldDiffData[] {
  const properties = activity.properties as TimelineActivityProperties | null;
  const diff = properties?.diff ?? {};

  return Object.entries(diff).map(([fieldKey, change]) => {
    let beforeValue = formatFieldDisplayValue(fieldKey, change?.before);
    let afterValue = formatFieldDisplayValue(fieldKey, change?.after);

    if (FK_FIELDS.has(fieldKey)) {
      const hadBefore = typeof change?.before === "string" && change.before.length === 36;
      const hasAfter = typeof change?.after === "string" && change.after.length === 36;

      if (!hadBefore && hasAfter) {
        beforeValue = "—";
        afterValue = "Linked";
      } else if (hadBefore && !hasAfter) {
        beforeValue = "—";
        afterValue = "Removed";
      } else if (hadBefore && hasAfter) {
        beforeValue = "—";
        afterValue = "Reassigned";
      }
    }

    return {
      fieldKey,
      label: fieldLabelMap[fieldKey] ?? toTitleCase(fieldKey),
      beforeValue,
      afterValue,
      Icon: fieldIconMap[fieldKey] ?? Text,
    };
  });
}

export function getInteractionTitle(interaction: UnifiedTimelineInteraction): string {
  const typeLabel = toTitleCase(interaction.type);
  const contact = interaction.contacts;
  const contactName = contact
    ? `${contact.first_name} ${contact.last_name}`.trim()
    : "";

  return contactName ? `${typeLabel} with ${contactName}` : typeLabel;
}

/** Fields whose raw values are human-readable vocabulary terms. */
const VOCAB_FIELDS = new Set(["stage", "status", "type"]);

/** Fields that store foreign-key UUIDs — show "Changed" instead of raw IDs. */
const FK_FIELDS = new Set(["company_id", "contact_id", "deal_id"]);

/**
 * Formats a diff value for display, applying label resolution for known
 * vocabulary fields and masking raw UUIDs for FK fields.
 */
function formatFieldDisplayValue(fieldKey: string, value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }

  if (FK_FIELDS.has(fieldKey)) {
    return typeof value === "string" && value.length === 36 ? "Changed" : formatRawValue(value);
  }

  if (VOCAB_FIELDS.has(fieldKey) && typeof value === "string") {
    return toTitleCase(value);
  }

  return formatRawValue(value);
}

function formatRawValue(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${toTitleCase(k)}: ${String(v)}`);
    return entries.length > 0 ? entries.join(", ") : "—";
  }

  return JSON.stringify(value);
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
