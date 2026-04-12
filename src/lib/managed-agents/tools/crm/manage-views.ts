/**
 * CRM saved view tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/manage-views
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { crmViewEntityTypes } from "@/lib/crm/schemas";
import { validateViewFilters, viewFiltersSchema } from "@/lib/crm/view-filters";

import type { ManagedAgentTool } from "../types";

const sortSchema = z.object({
  column: z.string().min(1),
  ascending: z.boolean(),
});

const inputSchema = z.object({
  operation: z.enum(["create", "list", "update", "delete"]).describe(
    "Which saved-view operation to perform.",
  ),
  name: z.string().min(1).optional().describe("Display name for create or update."),
  entity_type: z
    .enum(crmViewEntityTypes)
    .optional()
    .describe("CRM entity this view filters (contacts, companies, deals, tasks)."),
  filters: viewFiltersSchema
    .optional()
    .describe(
      "Filter object for create or update. Keys are column names or column_after/column_before for date ranges. Values can be strings, numbers, booleans, string arrays, or symbolic date tokens.",
    ),
  sort: sortSchema.nullable().optional().describe("Optional sort config for create or update."),
  view_id: z.string().uuid().optional().describe("UUID of the view to update or delete."),
});

type ManageViewsInput = z.infer<typeof inputSchema>;

export const manageViewsTool: ManagedAgentTool<ManageViewsInput> = {
  name: "manage_views",
  description:
    "Create, list, update, or delete saved CRM views. " +
    "A view is a named filter+sort preset that appears as a pill tab on the CRM page. " +
    "Only create views when the user explicitly asks. " +
    "Filter keys match CRM columns: stage, status, type, industry, company_id, contact_id, deal_id. " +
    "For date ranges use column_after/column_before (e.g. due_date_before, close_date_after). " +
    "Use symbolic tokens for dynamic dates: $today, $week_start, $week_end, $month_start, $month_end.",
  inputSchema,
  execute: async (input, context) => {
    switch (input.operation) {
      case "create": {
        if (!input.name || !input.entity_type || !input.filters) {
          return {
            success: false as const,
            error: "create requires name, entity_type, and filters.",
          };
        }

        const validationError = validateViewFilters(
          input.entity_type,
          input.filters,
          input.sort,
        );
        if (validationError) {
          return { success: false as const, error: validationError };
        }

        const { data, error } = await context.supabase
          .from("crm_views")
          .insert({
            client_id: context.clientId,
            name: input.name,
            entity_type: input.entity_type,
            filters: input.filters,
            sort: input.sort ?? null,
          })
          .select()
          .single();

        if (error) {
          return { success: false as const, error: error.message };
        }

        await captureServerEvent({
          distinctId: context.clientId,
          event: "crm_view_created",
          properties: { entity_type: input.entity_type, source: "agent" },
        });

        return { success: true as const, view: data };
      }

      case "list": {
        let query = context.supabase
          .from("crm_views")
          .select("*")
          .eq("client_id", context.clientId);

        if (input.entity_type) {
          query = query.eq("entity_type", input.entity_type);
        }

        const { data, error } = await query
          .order("is_seeded", { ascending: false })
          .order("created_at", { ascending: true });

        if (error) {
          return { success: false as const, error: error.message };
        }

        return { success: true as const, views: data ?? [], count: (data ?? []).length };
      }

      case "update": {
        if (!input.view_id) {
          return { success: false as const, error: "update requires view_id." };
        }

        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) {
          updates.name = input.name;
        }
        if (input.filters !== undefined) {
          updates.filters = input.filters;
        }
        if (input.sort !== undefined) {
          updates.sort = input.sort;
        }

        if (Object.keys(updates).length === 0) {
          return { success: false as const, error: "No fields to update." };
        }

        if (input.filters || input.sort) {
          const { data: existing } = await context.supabase
            .from("crm_views")
            .select("entity_type")
            .eq("view_id", input.view_id)
            .eq("client_id", context.clientId)
            .single();

          if (!existing) {
            return { success: false as const, error: "View not found." };
          }

          const validationError = validateViewFilters(
            existing.entity_type,
            input.filters ?? {},
            input.sort,
          );
          if (validationError) {
            return { success: false as const, error: validationError };
          }
        }

        const { data, error } = await context.supabase
          .from("crm_views")
          .update(updates)
          .eq("view_id", input.view_id)
          .eq("client_id", context.clientId)
          .select()
          .single();

        if (error) {
          return { success: false as const, error: error.message };
        }

        return { success: true as const, view: data };
      }

      case "delete": {
        if (!input.view_id) {
          return { success: false as const, error: "delete requires view_id." };
        }

        const { error } = await context.supabase
          .from("crm_views")
          .delete()
          .eq("view_id", input.view_id)
          .eq("client_id", context.clientId);

        if (error) {
          return { success: false as const, error: error.message };
        }

        await captureServerEvent({
          distinctId: context.clientId,
          event: "crm_view_deleted",
          properties: { source: "agent" },
        });

        return { success: true as const, deleted: true };
      }
    }
  },
};
