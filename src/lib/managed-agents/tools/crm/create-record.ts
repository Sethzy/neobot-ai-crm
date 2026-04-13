/**
 * Unified CRM record creation tool for managed agents.
 * Ported from the legacy runner without query-shape changes.
 *
 * @module lib/managed-agents/tools/crm/create-record
 */
import { z } from "zod";

import {
  CRM_DEFAULTS,
  matchVocabularyValue,
  type CrmVocabConfig,
} from "@/lib/crm/config";
import { captureServerEvent, captureServerEvents } from "@/lib/analytics/posthog-server";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { normalizeEmail, normalizePhone, normalizeWebsite } from "@/lib/crm/normalize";

import { buildContainsIlikeLiteral, buildIlikePattern } from "@/lib/crm/filter-utils";

import type { ManagedAgentTool, ToolContext } from "../types";

const CREATE_ENTITIES = ["contacts", "companies", "deals"] as const;
type CreateEntity = (typeof CREATE_ENTITIES)[number];

function normalizeIdentityText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeComparableText(value: unknown): string {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeDuplicateEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeDuplicatePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return normalizePhone(trimmed) ?? trimmed;
}

async function findDuplicateContacts(
  context: ToolContext,
  firstName: string,
  lastName: string,
  email?: string | null,
  phone?: string | null,
): Promise<unknown[] | null> {
  const orParts: string[] = [
    `and(first_name.ilike.${buildContainsIlikeLiteral(firstName)},last_name.ilike.${buildContainsIlikeLiteral(lastName)})`,
  ];

  if (email) {
    orParts.push(`email.eq.${email.toLowerCase()}`);
  }
  if (phone) {
    orParts.push(`phone.eq.${phone}`);
  }

  const { data, error } = await context.supabase
    .from("contacts")
    .select("*")
    .eq("client_id", context.clientId)
    .or(orParts.join(","))
    .limit(10);

  if (error) {
    return null;
  }

  return data ?? [];
}

async function findDuplicateCompanies(
  context: ToolContext,
  name: string,
  email?: string | null,
  phone?: string | null,
): Promise<unknown[] | null> {
  const orParts: string[] = [`name.ilike.${buildContainsIlikeLiteral(name)}`];

  if (email) {
    orParts.push(`email.eq.${email.toLowerCase()}`);
  }
  if (phone) {
    orParts.push(`phone.eq.${phone}`);
  }

  const { data, error } = await context.supabase
    .from("companies")
    .select("*")
    .eq("client_id", context.clientId)
    .or(orParts.join(","))
    .limit(10);

  if (error) {
    return null;
  }

  return data ?? [];
}

async function findDuplicateDeals(
  context: ToolContext,
  address: string,
): Promise<unknown[] | null> {
  const { data, error } = await context.supabase
    .from("deals")
    .select("*")
    .eq("client_id", context.clientId)
    .ilike("address", buildIlikePattern(address))
    .limit(10);

  if (error) {
    return null;
  }

  return data ?? [];
}

function dedupKey(entity: CreateEntity, record: Record<string, unknown>): string {
  switch (entity) {
    case "contacts":
      return `${normalizeComparableText(record.first_name)}|${normalizeComparableText(record.last_name)}`;
    case "companies":
      return normalizeComparableText(record.name);
    case "deals":
      return normalizeComparableText(record.address);
  }
}

function duplicateSignatures(entity: CreateEntity, record: Record<string, unknown>): string[] {
  switch (entity) {
    case "contacts": {
      const signatures = [`name:${dedupKey(entity, record)}`];
      const email = normalizeDuplicateEmail(record.email);
      const phone = normalizeDuplicatePhone(record.phone);
      if (email) signatures.push(`email:${email}`);
      if (phone) signatures.push(`phone:${phone}`);
      return signatures;
    }
    case "companies": {
      const signatures = [`name:${dedupKey(entity, record)}`];
      const email = normalizeDuplicateEmail(record.email);
      const phone = normalizeDuplicatePhone(record.phone);
      if (email) signatures.push(`email:${email}`);
      if (phone) signatures.push(`phone:${phone}`);
      return signatures;
    }
    case "deals":
      return [`address:${dedupKey(entity, record)}`];
  }
}

async function findDuplicates(
  context: ToolContext,
  entity: CreateEntity,
  record: Record<string, unknown>,
): Promise<unknown[] | null> {
  switch (entity) {
    case "contacts":
      return findDuplicateContacts(
        context,
        normalizeIdentityText(record.first_name),
        normalizeIdentityText(record.last_name),
        record.email ? String(record.email) : null,
        record.phone ? (normalizePhone(String(record.phone)) ?? String(record.phone)) : null,
      );
    case "companies":
      return findDuplicateCompanies(
        context,
        normalizeIdentityText(record.name),
        record.email ? String(record.email) : null,
        record.phone ? (normalizePhone(String(record.phone)) ?? String(record.phone)) : null,
      );
    case "deals":
      return findDuplicateDeals(context, normalizeIdentityText(record.address));
  }
}

function buildContactRow(
  clientId: string,
  record: Record<string, unknown>,
  defaultContactType: string,
  contactTypes: readonly string[],
) {
  const rawType = (record.type as string) ?? defaultContactType;

  return {
    client_id: clientId,
    first_name: normalizeIdentityText(record.first_name),
    last_name: normalizeIdentityText(record.last_name),
    type: matchVocabularyValue(rawType, contactTypes),
    email: normalizeEmail(record.email),
    phone: normalizePhone(record.phone as string | null) ?? (record.phone as string | null) ?? null,
    custom_fields: (record.custom_fields as Record<string, unknown>) ?? {},
  };
}

function buildCompanyRow(
  clientId: string,
  record: Record<string, unknown>,
  companyIndustries: readonly string[],
) {
  const rawIndustry = record.industry as string | undefined;

  return {
    client_id: clientId,
    name: normalizeIdentityText(record.name),
    industry: rawIndustry ? matchVocabularyValue(rawIndustry, companyIndustries) : null,
    website: normalizeWebsite(record.website as string | null) ?? (record.website as string | null) ?? null,
    phone: normalizePhone(record.phone as string | null) ?? (record.phone as string | null) ?? null,
    email: normalizeEmail(record.email),
    address: (record.address as string) ?? null,
    custom_fields: (record.custom_fields as Record<string, unknown>) ?? {},
  };
}

function buildDealRow(
  clientId: string,
  record: Record<string, unknown>,
  defaultDealStage: string,
  dealStages: readonly string[],
) {
  const rawStage = (record.stage as string) ?? defaultDealStage;

  if (typeof record.amount === "number") {
    if (!Number.isFinite(record.amount) || record.amount < 0) {
      throw new Error("amount must be a finite non-negative number");
    }
  }

  return {
    client_id: clientId,
    address: normalizeIdentityText(record.address),
    stage: matchVocabularyValue(rawStage, dealStages),
    amount: record.amount as number | undefined,
    custom_fields: (record.custom_fields as Record<string, unknown>) ?? {},
  };
}

const RECORD_TYPE_MAP: Record<CreateEntity, "contact" | "company" | "deal"> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

const PK_MAP: Record<CreateEntity, string> = {
  contacts: "contact_id",
  companies: "company_id",
  deals: "deal_id",
};

async function insertRecordNotes(
  context: ToolContext,
  entity: CreateEntity,
  inputRecords: Record<string, unknown>[],
  createdRecords: Record<string, unknown>[],
) {
  const recordType = RECORD_TYPE_MAP[entity];
  const pk = PK_MAP[entity];
  const noteRows: Array<{
    client_id: string;
    record_type: string;
    record_id: string;
    body: string;
  }> = [];

  for (let index = 0; index < inputRecords.length; index += 1) {
    const noteBody = inputRecords[index].notes;
    const created = createdRecords[index];

    if (typeof noteBody === "string" && noteBody.trim() && created?.[pk]) {
      noteRows.push({
        client_id: context.clientId,
        record_type: recordType,
        record_id: created[pk] as string,
        body: noteBody,
      });
    }
  }

  if (noteRows.length > 0) {
    await context.supabase.from("record_notes").insert(noteRows);
  }
}

const inputSchema = z.object({
  entity: z.enum(CREATE_ENTITIES).describe("CRM entity type to create."),
  records: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(50)
    .describe(
      "Array of records to create. Required fields by entity: " +
        "contacts: { first_name, last_name }. " +
        "companies: { name }. " +
        "deals: { address }. " +
        "Optional fields vary by entity - use the CRM schema in system context.",
    ),
  force_create: z.boolean().optional().describe("Skip duplicate detection. Default false."),
});

type CreateRecordInput = z.infer<typeof inputSchema>;
type CreateRecordResult =
  | {
      success: false;
      error: string;
    }
  | {
      success: false;
      reason: "possible_duplicates";
      possible_duplicates: Array<{
        input: Record<string, unknown>;
        existing: unknown[];
      }>;
      message: string;
    }
  | {
      success: true;
      record: Record<string, unknown>;
      count: 1;
    }
  | {
      success: true;
      records: Record<string, unknown>[];
      count: number;
    };

export const createRecordTool: ManagedAgentTool<CreateRecordInput, CreateRecordResult> = {
  name: "create_record",
  description:
    "Create one or more CRM records. Specify the entity type and field values. " +
    "Has built-in duplicate detection - if matching records exist, returns possible_duplicates instead of creating. " +
    "Set force_create: true to override. Supports batch creation (up to 50 records per call). " +
    "Data Modification Warning: Only create records when the user has explicitly asked.",
  inputSchema,
  execute: async ({ entity, records, force_create }, context) => {
    const config: CrmVocabConfig = context.crmConfig ?? CRM_DEFAULTS;
    const defaultContactType = config.contact_types.includes("other")
      ? "other"
      : config.contact_types[0];
    const defaultDealStage = config.deal_stages.includes("leads")
      ? "leads"
      : config.deal_stages[0];

    const tableMap: Record<CreateEntity, string> = {
      contacts: "contacts",
      companies: "companies",
      deals: "deals",
    };

    const analyticsType: Record<CreateEntity, string> = {
      contacts: "contact",
      companies: "company",
      deals: "deal",
    };

    if (!force_create) {
      const seen = new Set<string>();
      const intraDupes: string[] = [];

      for (const record of records) {
        for (const signature of duplicateSignatures(entity, record)) {
          if (seen.has(signature)) {
            intraDupes.push(signature);
          }
          seen.add(signature);
        }
      }

      if (intraDupes.length > 0) {
        const dupeNames = [...new Set(intraDupes)].map((key) =>
          key
            .replace(/^(name|email|phone|address):/, "")
            .replace("|", " "),
        );

        return {
          success: false as const,
          reason: "possible_duplicates" as const,
          possible_duplicates: [],
          message: `Intra-batch duplicates detected: ${dupeNames.join(", ")}. Remove duplicates or use force_create: true.`,
        };
      }

      const allDuplicates: Array<{
        input: Record<string, unknown>;
        existing: unknown[];
      }> = [];

      for (const record of records) {
        const duplicates = await findDuplicates(context, entity, record);
        if (duplicates && duplicates.length > 0) {
          allDuplicates.push({ input: record, existing: duplicates });
        }
      }

      if (allDuplicates.length > 0) {
        return {
          success: false as const,
          reason: "possible_duplicates" as const,
          possible_duplicates: allDuplicates,
          message: `Found existing ${entity} matching ${allDuplicates.length} entries. Review and use update_record, or re-call with force_create: true.`,
        };
      }
    }

    let rows;
    try {
      rows = records.map((record) => {
        switch (entity) {
          case "contacts":
            return buildContactRow(context.clientId, record, defaultContactType, config.contact_types);
          case "companies":
            return buildCompanyRow(context.clientId, record, config.company_industries);
          case "deals":
            return buildDealRow(context.clientId, record, defaultDealStage, config.deal_stages);
        }
      });
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Validation failed",
      };
    }

    const table = tableMap[entity];

    if (rows.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (context.supabase as any)
        .from(table)
        .insert(rows[0])
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      await insertRecordNotes(context, entity, records, [data]);

      await captureServerEvent({
        distinctId: context.clientId,
        event: "crm_record_created",
        properties: {
          entity_type: analyticsType[entity],
          source: "agent",
        },
      });

      void captureTimelineActivity({
        supabase: context.supabase,
        clientId: context.clientId,
        recordType: RECORD_TYPE_MAP[entity],
        recordId: String(data[PK_MAP[entity]]),
        action: "created",
        actorType: "agent",
        after: data as Record<string, unknown>,
      });

      return { success: true as const, record: data, count: 1 as const };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from(table)
      .insert(rows)
      .select();

    if (error) {
      return { success: false as const, error: error.message };
    }

    const created = data ?? [];

    await insertRecordNotes(context, entity, records, created);

    await captureServerEvents(
      created.map(() => ({
        distinctId: context.clientId,
        event: "crm_record_created",
        properties: {
          entity_type: analyticsType[entity],
          source: "agent",
        },
      })),
    );

    for (const createdRecord of created as Record<string, unknown>[]) {
      void captureTimelineActivity({
        supabase: context.supabase,
        clientId: context.clientId,
        recordType: RECORD_TYPE_MAP[entity],
        recordId: String(createdRecord[PK_MAP[entity]]),
        action: "created",
        actorType: "agent",
        after: createdRecord,
      });
    }

    return {
      success: true as const,
      records: created,
      count: created.length,
    };
  },
};
