/**
 * Unified CRM record creation tool — replaces 6 per-entity create/batch tools.
 * @module lib/runner/tools/crm/create-record
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  CRM_DEFAULTS,
  matchVocabularyValue,
  type CrmVocabConfig,
} from "@/lib/crm/config";
import type { Database } from "@/types/database";
import {
  captureServerEvent,
  captureServerEvents,
} from "@/lib/analytics/posthog-server";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { normalizePhone } from "@/lib/crm/normalize";

import { buildIlikePattern, buildContainsIlikeLiteral } from "./filter-utils";

/** Entity types supported by create_record. */
const CREATE_ENTITIES = ["contacts", "companies", "deals"] as const;
type CreateEntity = (typeof CREATE_ENTITIES)[number];

// ---------------------------------------------------------------------------
// Per-entity duplicate detection
// ---------------------------------------------------------------------------

/**
 * Searches for contacts that likely match the given identity signals.
 *
 * Matches on any of:
 *   - first_name AND last_name (case-insensitive contains)
 *   - email (exact, case-insensitive)
 *   - phone (exact E.164)
 *
 * Using OR across all signals means we catch the case where the agent
 * supplies an email or phone that already belongs to an existing contact,
 * even if the name differs slightly.
 *
 * Returns matched rows or `null` on query error (best-effort — callers fall through).
 */
async function findDuplicateContacts(
  supabase: SupabaseClient<Database>,
  clientId: string,
  firstName: string,
  lastName: string,
  email?: string | null,
  phone?: string | null,
): Promise<unknown[] | null> {
  // Build OR conditions. The name check is an AND-group nested inside the OR.
  // PostgREST filter string format: "and(col.op.val,col.op.val),col.op.val"
  const orParts: string[] = [
    `and(first_name.ilike.${buildContainsIlikeLiteral(firstName)},last_name.ilike.${buildContainsIlikeLiteral(lastName)})`,
  ];
  if (email) orParts.push(`email.eq.${email.toLowerCase()}`);
  if (phone) orParts.push(`phone.eq.${phone}`);

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .or(orParts.join(","))
    .limit(10);

  if (error) return null;
  return data ?? [];
}

/**
 * Searches for companies that likely match the given identity signals.
 *
 * Matches on any of: name (contains), email (exact), phone (exact E.164).
 * Returns matched rows or `null` on query error (best-effort).
 */
async function findDuplicateCompanies(
  supabase: SupabaseClient<Database>,
  clientId: string,
  name: string,
  email?: string | null,
  phone?: string | null,
): Promise<unknown[] | null> {
  const orParts: string[] = [`name.ilike.${buildContainsIlikeLiteral(name)}`];
  if (email) orParts.push(`email.eq.${email.toLowerCase()}`);
  if (phone) orParts.push(`phone.eq.${phone}`);

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("client_id", clientId)
    .or(orParts.join(","))
    .limit(10);

  if (error) return null;
  return data ?? [];
}

/**
 * Searches for deals matching address (case-insensitive).
 * Returns matched rows or `null` on query error (best-effort).
 */
async function findDuplicateDeals(
  supabase: SupabaseClient<Database>,
  clientId: string,
  address: string,
): Promise<unknown[] | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("client_id", clientId)
    .ilike("address", buildIlikePattern(address))
    .limit(10);

  if (error) return null;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Dedup key extraction
// ---------------------------------------------------------------------------

/** Extracts the case-insensitive dedup key for a record based on entity type. */
function dedupKey(entity: CreateEntity, record: Record<string, unknown>): string {
  switch (entity) {
    case "contacts":
      return `${String(record.first_name ?? "").toLowerCase()}|${String(record.last_name ?? "").toLowerCase()}`;
    case "companies":
      return String(record.name ?? "").toLowerCase();
    case "deals":
      return String(record.address ?? "").toLowerCase();
  }
}

/** Runs entity-specific DB duplicate detection for a single record. */
async function findDuplicates(
  supabase: SupabaseClient<Database>,
  clientId: string,
  entity: CreateEntity,
  record: Record<string, unknown>,
): Promise<unknown[] | null> {
  switch (entity) {
    case "contacts":
      return findDuplicateContacts(
        supabase,
        clientId,
        String(record.first_name ?? ""),
        String(record.last_name ?? ""),
        record.email ? String(record.email) : null,
        // Normalize before comparing so "+1-212-555-1234" matches "+12125551234" in the DB.
        record.phone ? (normalizePhone(String(record.phone)) ?? String(record.phone)) : null,
      );
    case "companies":
      return findDuplicateCompanies(
        supabase,
        clientId,
        String(record.name ?? ""),
        record.email ? String(record.email) : null,
        record.phone ? (normalizePhone(String(record.phone)) ?? String(record.phone)) : null,
      );
    case "deals":
      return findDuplicateDeals(supabase, clientId, String(record.address ?? ""));
  }
}

// ---------------------------------------------------------------------------
// Row builders (entity → Supabase insert row)
// ---------------------------------------------------------------------------

function buildContactRow(
  clientId: string,
  record: Record<string, unknown>,
  defaultContactType: string,
  contactTypes: readonly string[],
) {
  const rawType = (record.type as string) ?? defaultContactType;
  return {
    client_id: clientId,
    first_name: record.first_name as string,
    last_name: record.last_name as string,
    type: matchVocabularyValue(rawType, contactTypes),
    email: (record.email as string) ?? null,
    // Normalize to E.164; fall back to raw string if unparseable so data isn't silently dropped.
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
    name: record.name as string,
    industry: rawIndustry ? matchVocabularyValue(rawIndustry, companyIndustries) : null,
    website: (record.website as string) ?? null,
    phone: normalizePhone(record.phone as string | null) ?? (record.phone as string | null) ?? null,
    email: (record.email as string) ?? null,
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
  return {
    client_id: clientId,
    address: record.address as string,
    stage: matchVocabularyValue(rawStage, dealStages),
    amount: record.amount as number | undefined,
    custom_fields: (record.custom_fields as Record<string, unknown>) ?? {},
  };
}

/** Maps plural entity names to record_notes record_type values. */
const RECORD_TYPE_MAP: Record<CreateEntity, "contact" | "company" | "deal"> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

/** Maps plural entity names to primary key column names. */
const PK_MAP: Record<CreateEntity, string> = {
  contacts: "contact_id",
  companies: "company_id",
  deals: "deal_id",
};

/**
 * Creates record_notes rows for any input records that included a `notes` field.
 * Best-effort — note insertion failures don't fail the overall create.
 */
async function insertRecordNotes(
  supabase: SupabaseClient<Database>,
  clientId: string,
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

  for (let i = 0; i < inputRecords.length; i++) {
    const noteBody = inputRecords[i].notes;
    const created = createdRecords[i];
    if (typeof noteBody === "string" && noteBody.trim() && created?.[pk]) {
      noteRows.push({
        client_id: clientId,
        record_type: recordType,
        record_id: created[pk] as string,
        body: noteBody,
      });
    }
  }

  if (noteRows.length > 0) {
    await supabase.from("record_notes").insert(noteRows);
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Creates the create_record tool.
 */
export function createCreateRecordTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const defaultContactType = config.contact_types.includes("other")
    ? "other"
    : config.contact_types[0];
  const defaultDealStage = config.deal_stages.includes("leads")
    ? "leads"
    : config.deal_stages[0];

  /** Map entity → Supabase table name. */
  const TABLE_MAP: Record<CreateEntity, string> = {
    contacts: "contacts",
    companies: "companies",
    deals: "deals",
  };

  /** Map entity → analytics entity_type label. */
  const ANALYTICS_TYPE: Record<CreateEntity, string> = {
    contacts: "contact",
    companies: "company",
    deals: "deal",
  };

  return {
    create_record: tool({
      description:
        "Create one or more CRM records. Specify the entity type and field values. " +
        "Has built-in duplicate detection — if matching records exist, returns possible_duplicates instead of creating. " +
        "Set force_create: true to override. Supports batch creation (up to 50 records per call). " +
        "Data Modification Warning: Only create records when the user has explicitly asked.",
      inputSchema: z.object({
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
              "Optional fields vary by entity — use the CRM schema in system context.",
          ),
        force_create: z
          .boolean()
          .optional()
          .describe("Skip duplicate detection. Default false."),
      }),
      execute: async ({ entity, records, force_create }) => {
        // --- Dedup (unless force_create) ---
        if (!force_create) {
          // Intra-batch dedup: same dedup key appearing twice in the batch
          const keys = records.map((r) => dedupKey(entity, r));
          const seen = new Set<string>();
          const intraDupes: string[] = [];
          for (const key of keys) {
            if (seen.has(key)) intraDupes.push(key);
            seen.add(key);
          }
          if (intraDupes.length > 0) {
            const dupeNames = [...new Set(intraDupes)].map((k) =>
              k.includes("|") ? k.replace("|", " ") : k,
            );
            return {
              success: false as const,
              reason: "possible_duplicates" as const,
              possible_duplicates: [],
              message: `Intra-batch duplicates detected: ${dupeNames.join(", ")}. Remove duplicates or use force_create: true.`,
            };
          }

          // Per-entry DB dedup
          const allDuplicates: Array<{
            input: Record<string, unknown>;
            existing: unknown[];
          }> = [];
          for (const record of records) {
            const duplicates = await findDuplicates(supabase, clientId, entity, record);
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

        // --- Build insert rows ---
        const rows = records.map((record) => {
          switch (entity) {
            case "contacts":
              return buildContactRow(clientId, record, defaultContactType, config.contact_types);
            case "companies":
              return buildCompanyRow(clientId, record, config.company_industries);
            case "deals":
              return buildDealRow(clientId, record, defaultDealStage, config.deal_stages);
          }
        });

        const table = TABLE_MAP[entity];

        // --- Single record: insert + single() ---
        if (rows.length === 1) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any)
            .from(table)
            .insert(rows[0])
            .select()
            .single();

          if (error) {
            return { success: false as const, error: error.message };
          }

          await insertRecordNotes(supabase, clientId, entity, records, [data]);

          await captureServerEvent({
            distinctId: clientId,
            event: "crm_record_created",
            properties: {
              entity_type: ANALYTICS_TYPE[entity],
              source: "agent",
            },
          });

          void captureTimelineActivity({
            supabase,
            clientId,
            recordType: RECORD_TYPE_MAP[entity],
            recordId: String(data[PK_MAP[entity]]),
            action: "created",
            actorType: "agent",
            after: data as Record<string, unknown>,
          });

          return { success: true as const, record: data };
        }

        // --- Batch: insert + select() ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from(table)
          .insert(rows)
          .select();

        if (error) {
          return { success: false as const, error: error.message };
        }

        const created = data ?? [];

        await insertRecordNotes(supabase, clientId, entity, records, created);

        await captureServerEvents(
          created.map(() => ({
            distinctId: clientId,
            event: "crm_record_created",
            properties: {
              entity_type: ANALYTICS_TYPE[entity],
              source: "agent",
            },
          })),
        );

        for (const createdRecord of created as Record<string, unknown>[]) {
          void captureTimelineActivity({
            supabase,
            clientId,
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
    }),
  };
}
