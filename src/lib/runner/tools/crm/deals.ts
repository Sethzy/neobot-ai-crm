/**
 * CRM deal tools for the runner.
 * @module lib/runner/tools/crm/deals
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dealStageValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { buildContainsIlikeLiteral } from "./filter-utils";

const DEFAULT_RESULT_LIMIT = 20;

function buildSearchExpression(query: string): string {
  const ilikeLiteral = buildContainsIlikeLiteral(query);

  return [
    `address.ilike.${ilikeLiteral}`,
    `notes.ilike.${ilikeLiteral}`,
  ].join(",");
}

/**
 * Creates deal-related CRM tools.
 *
 * The factory closes over `clientId` so inserts stay tenant-scoped.
 */
export function createDealTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_deals = tool({
    description:
      "Search deals by address or notes. Optionally filter by stage or contact id.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for address and notes."),
      stage: z.enum(dealStageValues).optional().describe("Optional deal stage filter."),
      contact_id: z.string().uuid().optional().describe("Optional contact id filter."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, stage, contact_id, limit }) => {
      const maxResults = limit ?? DEFAULT_RESULT_LIMIT;
      let queryBuilder = supabase.from("deals").select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query));
      }

      if (stage) {
        queryBuilder = queryBuilder.eq("stage", stage);
      }

      if (contact_id) {
        queryBuilder = queryBuilder.eq("contact_id", contact_id);
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
      "Create a new deal. Use this for new listings or opportunities.",
    inputSchema: z.object({
      address: z.string().min(1).describe("Property address."),
      stage: z.enum(dealStageValues).optional().describe("Deal stage."),
      price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
      contact_id: z.string().uuid().optional().describe("Associated contact id."),
      notes: z.string().optional().describe("Deal notes."),
    }),
    execute: async ({ address, stage, price, contact_id, notes }) => {
      const { data, error } = await supabase
        .from("deals")
        .insert({
          client_id: clientId,
          address,
          stage,
          price,
          contact_id,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        deal: data,
      };
    },
  });

  const update_deal = tool({
    description:
      "Update an existing deal by id. Use this after finding the deal via search_deals.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to update."),
      address: z.string().min(1).optional().describe("Updated address."),
      stage: z.enum(dealStageValues).optional().describe("Updated stage."),
      price: z.number().int().nonnegative().nullable().optional().describe("Updated price or null."),
      contact_id: z.string().uuid().nullable().optional().describe("Updated contact id or null."),
      notes: z.string().nullable().optional().describe("Updated notes or null."),
    }),
    execute: async ({ deal_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
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

      return {
        success: true as const,
        deal: data,
      };
    },
  });

  return {
    search_deals,
    create_deal,
    update_deal,
  };
}
