/**
 * Lucide icon mapping for CRM list-table column headers.
 *
 * Icons are resolved at render time (not stored on FieldDefinition) so the
 * Zod field-definition schema stays serialisable to the database. Resolution
 * order:
 *   1. Known field key — `email`, `phone`, `website` etc. get their matching
 *      contextual icon regardless of type.
 *   2. Field type — fallback per FieldType so custom fields still pick up a
 *      sensible icon.
 *
 * @module lib/crm/field-icons
 */
import {
  AlignLeft,
  Building2,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Globe,
  Hash,
  Linkedin,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Tag,
  Tags,
  ToggleLeft,
  User,
  UserRound,
  Link as LinkIcon,
  type LucideIcon,
} from "lucide-react";

import type { FieldDefinition, FieldType } from "./field-definitions";

/**
 * Contextual overrides for common field keys. Wins over the type-based
 * fallback below.
 */
const FIELD_KEY_ICONS: Record<string, LucideIcon> = {
  name: UserRound,
  first_name: UserRound,
  last_name: UserRound,
  emails: Mail,
  email: Mail,
  phones: Phone,
  phone: Phone,
  city: MapPin,
  address: MapPin,
  company_id: Building2,
  company: Building2,
  job_title: User,
  type: Tag,
  stage: Tag,
  industry: Tag,
  linkedin: Linkedin,
  x_link: LinkIcon,
  website: Globe,
  amount: CircleDollarSign,
  close_date: CalendarClock,
  due_date: CalendarClock,
  created_at: CalendarClock,
  updated_at: CalendarClock,
  point_of_contact: UserRound,
};

/** Per-type fallback when the field key isn't in FIELD_KEY_ICONS. */
const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: AlignLeft,
  full_name: UserRound,
  number: Hash,
  currency: CircleDollarSign,
  email: Mail,
  phone: Phone,
  url: Globe,
  date: CalendarClock,
  boolean: ToggleLeft,
  select: Tag,
  tags: Tags,
  richtext: FileText,
  file: Paperclip,
  relation: UserRound,
};

/** Resolves the column-header icon for a given field definition. */
export function getFieldIcon(field: Pick<FieldDefinition, "key" | "type">): LucideIcon {
  return FIELD_KEY_ICONS[field.key] ?? FIELD_TYPE_ICONS[field.type];
}
