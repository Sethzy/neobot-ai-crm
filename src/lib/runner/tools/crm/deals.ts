/**
 * CRM deal tools for the runner.
 * @module lib/runner/tools/crm/deals
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  buildCustomFieldsSchema,
  CRM_DEFAULTS,
  type CrmVocabConfig,
} from "@/lib/crm/config";
import type { Database, JsonObject } from "@/types/database";
import {
  captureServerEvent,
  captureServerEvents,
} from "@/lib/analytics/posthog-server";

import { mergeCustomFields } from "./custom-fields";
import { buildIlikePattern, buildSearchExpression, DEFAULT_CRM_RESULT_LIMIT } from "./filter-utils";

const DEAL_SEARCH_COLUMNS = ["address", "notes"];
type DealUpdate = Database["public"]["Tables"]["deals"]["Update"];

/**
 * Searches for existing deals matching address (case-insensitive).
 * Returns matched rows or `null` on query error (best-effort — callers should fall through on null).
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

/**
 * Creates deal-related CRM tools.
 *
 * The factory closes over `clientId` so inserts stay tenant-scoped.
 */
export function createDealTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const dealStageEnum = z.enum(config.deal_stages as [string, ...string[]]);
  const dealStageList = config.deal_stages.join(", ");
  const defaultDealStage = config.deal_stages.includes("leads")
    ? "leads"
    : config.deal_stages[0];

  const search_deals = tool({
    description:
      `Search ${config.deal_label}s by address or notes. Optionally filter by stage. ` +
      `Valid stages: ${dealStageList}. ` +
      `Omit query to list all ${config.deal_label}s. ` +
      "Use get_deal_contacts to find contacts linked to a deal.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for address and notes. Omit to list all deals."),
      stage: dealStageEnum.optional().describe(`Deal pipeline stage filter (${dealStageList}).`),
      company_id: z.string().uuid().optional().describe("Filter by company UUID. Use search_companies to find this."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, stage, company_id, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
      let queryBuilder = supabase
        .from("deals")
        .select("*")
        .eq("client_id", clientId);

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, DEAL_SEARCH_COLUMNS));
      }

      if (stage) {
        queryBuilder = queryBuilder.eq("stage", stage);
      }

      if (company_id) {
        queryBuilder = queryBuilder.eq("company_id", company_id);
      }

      const { data, error } = await queryBuilder.limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const deals = data ?? [];

      return {
        success: true as const,
        deals,
        count: deals.length,
      };
    },
  });

  const create_deal = tool({
    description:
      `Create a new ${config.deal_label}. Has built-in duplicate detection — if a ${config.deal_label} with a matching address already exists, ` +
      "returns possible_duplicates instead of creating. Review the candidates and use update_deal on the existing " +
      "record, or re-call with force_create: true to override. " +
      "Use link_contact_to_deal after creating to associate contacts. " +
      "Data Modification Warning: Only create deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      address: z.string().min(1).describe("Property address."),
      stage: dealStageEnum.optional().describe(`Deal pipeline stage (${dealStageList}). Defaults to "${defaultDealStage}".`),
      price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
      notes: z.string().optional().describe("Deal notes."),
      custom_fields: buildCustomFieldsSchema(config.deal_custom_fields).optional()
        .describe(`Configured custom fields for ${config.deal_label.toLowerCase()}s.`),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection and create the deal regardless."),
    }),
    execute: async ({ address, stage, price, notes, custom_fields, force_create }) => {
      // Dedup check (best-effort — search failure falls through to insert)
      if (!force_create) {
        const duplicates = await findDuplicateDeals(supabase, clientId, address);
        if (duplicates && duplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: duplicates,
            message: `Found ${duplicates.length} existing deal(s) matching "${address}". Review and use update_deal, or re-call with force_create: true.`,
          };
        }
      }

      const { data, error } = await supabase
        .from("deals")
        .insert({
          client_id: clientId,
          address,
          stage: stage ?? defaultDealStage,
          price,
          notes: notes ?? null,
          custom_fields: custom_fields ?? {},
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      await captureServerEvent({
        distinctId: clientId,
        event: "crm_record_created",
        properties: {
          entity_type: "deal",
          source: "agent",
        },
      });

      return {
        success: true as const,
        deal: data,
      };
    },
  });

  const update_deal = tool({
    description:
      `Update an existing ${config.deal_label} by id. Use this after finding it via search_deals. ` +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to update. Use search_deals to find this."),
      address: z.string().min(1).optional().describe("Updated address."),
      stage: dealStageEnum.optional().describe(`Updated pipeline stage (${dealStageList}).`),
      price: z.number().int().nonnegative().nullable().optional().describe("Updated price or null."),
      notes: z.string().nullable().optional().describe("Updated notes or null."),
      custom_fields: buildCustomFieldsSchema(config.deal_custom_fields, "update").optional()
        .describe(`Partial custom field patch for ${config.deal_label.toLowerCase()}s.`),
    }),
    execute: async ({ deal_id, ...fields }) => {
      let previousStage: string | null = null;
      let previousPrice: number | null = null;

      if (fields.stage) {
        const { data: existingDeal, error: existingDealError } = await supabase
          .from("deals")
          .select("stage, price")
          .eq("deal_id", deal_id)
          .eq("client_id", clientId)
          .maybeSingle();

        if (existingDealError) {
          return { success: false as const, error: existingDealError.message };
        }

        previousStage = existingDeal?.stage ?? null;
        previousPrice = existingDeal?.price ?? null;
      }

      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as DealUpdate;

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      if ("custom_fields" in updates) {
        const result = await mergeCustomFields(
          supabase, "deals", "deal_id", deal_id, clientId,
          (updates.custom_fields as JsonObject | undefined) ?? {},
        );
        if (result.error) return { success: false as const, error: result.error };
        updates.custom_fields = result.merged;
      }

      const { data, error } = await supabase
        .from("deals")
        .update(updates)
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      if (fields.stage && previousStage && previousStage !== data.stage) {
        await captureServerEvent({
          distinctId: clientId,
          event: "deal_stage_changed",
          properties: {
            from_stage: previousStage,
            to_stage: data.stage,
            deal_value:
              typeof data.price === "number"
                ? data.price
                : previousPrice,
          },
        });
      }

      return {
        success: true as const,
        deal: data,
      };
    },
  });

  const batch_create_deals = tool({
    description:
      "Create multiple deals in a single call. Use this for bulk imports (e.g., open house leads, CSV). " +
      "Use link_contact_to_deal after creating to associate contacts with each deal. " +
      "Data Modification Warning: Only create deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deals: z
        .array(
          z.object({
            address: z.string().min(1).describe("Property address."),
            stage: dealStageEnum.optional().describe(`Deal pipeline stage (${dealStageList}). Defaults to "${defaultDealStage}".`),
            price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
            notes: z.string().optional().describe("Deal notes."),
            custom_fields: buildCustomFieldsSchema(config.deal_custom_fields).optional()
              .describe(`Configured custom fields for ${config.deal_label.toLowerCase()}s.`),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of deals to create (1-50 per call)."),
    }),
    execute: async ({ deals }) => {
      const rows = deals.map((d) => ({
        client_id: clientId,
        address: d.address,
        stage: d.stage ?? defaultDealStage,
        price: d.price,
        notes: d.notes ?? null,
        custom_fields: d.custom_fields ?? {},
      }));

      const { data, error } = await supabase
        .from("deals")
        .insert(rows)
        .select();

      if (error) {
        return { success: false as const, error: error.message };
      }

      const created = data ?? [];

      await captureServerEvents(
        created.map(() => ({
          distinctId: clientId,
          event: "crm_record_created",
          properties: {
            entity_type: "deal",
            source: "agent",
          },
        })),
      );

      return {
        success: true as const,
        deals: created,
        count: created.length,
      };
    },
  });

  const delete_deal = tool({
    description:
      "Permanently delete a deal by id. This cannot be undone. " +
      "Use search_deals to find the deal first. " +
      "Associated contact links and interactions are also removed.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to delete."),
    }),
    needsApproval: true,
    execute: async ({ deal_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .delete()
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal: data };
    },
  });

  return {
    search_deals,
    create_deal,
    update_deal,
    batch_create_deals,
    delete_deal,
  };
}
