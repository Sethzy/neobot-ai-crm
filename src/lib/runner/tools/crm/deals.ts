/**
 * CRM deal tools for the runner.
 * @module lib/runner/tools/crm/deals
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dealStageValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { buildSearchExpression, DEFAULT_CRM_RESULT_LIMIT } from "./filter-utils";

const DEAL_SEARCH_COLUMNS = ["address", "notes"];

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
      "Search deals by address or notes. Optionally filter by stage. " +
      "Omit query to list all deals. " +
      "Use get_deal_contacts to find contacts linked to a deal.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for address and notes. Omit to list all deals."),
      stage: z.enum(dealStageValues).optional().describe("Deal pipeline stage filter (leads, negotiation, offer, closing, lost)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, stage, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
      let queryBuilder = supabase.from("deals").select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, DEAL_SEARCH_COLUMNS));
      }

      if (stage) {
        queryBuilder = queryBuilder.eq("stage", stage);
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
      "Create a new deal. Use this for new listings or opportunities. " +
      "Use link_contact_to_deal after creating to associate contacts. " +
      "Data Modification Warning: Only create deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      address: z.string().min(1).describe("Property address."),
      stage: z.enum(dealStageValues).optional().describe("Deal pipeline stage (leads, negotiation, offer, closing, lost). Defaults to 'leads'."),
      price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
      notes: z.string().optional().describe("Deal notes."),
    }),
    execute: async ({ address, stage, price, notes }) => {
      const { data, error } = await supabase
        .from("deals")
        .insert({
          client_id: clientId,
          address,
          stage,
          price,
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
      "Update an existing deal by id. Use this after finding the deal via search_deals. " +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to update. Use search_deals to find this."),
      address: z.string().min(1).optional().describe("Updated address."),
      stage: z.enum(dealStageValues).optional().describe("Updated pipeline stage (leads, negotiation, offer, closing, lost)."),
      price: z.number().int().nonnegative().nullable().optional().describe("Updated price or null."),
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
            stage: z.enum(dealStageValues).optional().describe("Deal pipeline stage (leads, negotiation, offer, closing, lost). Defaults to 'leads'."),
            price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
            notes: z.string().optional().describe("Deal notes."),
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
        stage: d.stage,
        price: d.price,
        notes: d.notes ?? null,
      }));

      const { data, error } = await supabase
        .from("deals")
        .insert(rows)
        .select();

      if (error) {
        return { success: false as const, error: error.message };
      }

      const created = data ?? [];

      return {
        success: true as const,
        deals: created,
        count: created.length,
      };
    },
  });

  return {
    search_deals,
    create_deal,
    update_deal,
    batch_create_deals,
  };
}
