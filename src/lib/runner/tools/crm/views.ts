/**
 * CRM view management tool for the runner.
 * @module lib/runner/tools/crm/views
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { crmViewEntityTypes } from "@/lib/crm/schemas";
import { validateViewFilters, viewFiltersSchema } from "@/lib/crm/view-filters";
import type { Database } from "@/types/database";

const sortSchema = z.object({
  column: z.string().min(1),
  ascending: z.boolean(),
});

const createInput = z.object({
  operation: z.literal("create"),
  name: z.string().min(1).describe("Display name for the view."),
  entity_type: z
    .enum(crmViewEntityTypes)
    .describe("CRM entity this view filters (contacts, companies, deals, tasks)."),
  filters: viewFiltersSchema.describe(
    "Filter object — keys are column names or column_after/column_before for date ranges. " +
      "Values: strings, numbers, booleans, string arrays (for IN filters), or symbolic tokens ($today, $week_start, $week_end, $month_start, $month_end).",
  ),
  sort: sortSchema.optional().describe("Optional sort column and direction."),
});

const listInput = z.object({
  operation: z.literal("list"),
  entity_type: z
    .enum(crmViewEntityTypes)
    .optional()
    .describe("Filter list by entity type. Omit to list all views."),
});

const updateInput = z.object({
  operation: z.literal("update"),
  view_id: z.string().uuid().describe("UUID of the view to update."),
  name: z.string().min(1).optional().describe("Updated display name."),
  filters: viewFiltersSchema.optional().describe("Updated filters (replaces existing)."),
  sort: sortSchema.nullable().optional().describe("Updated sort or null to clear."),
});

const deleteInput = z.object({
  operation: z.literal("delete"),
  view_id: z.string().uuid().describe("UUID of the view to delete."),
});

/**
 * Creates the manage_views tool for CRM saved views.
 */
export function createViewTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const manage_views = tool({
    description:
      "Create, list, update, or delete saved CRM views. " +
      "A view is a named filter+sort preset that appears as a pill tab on the CRM page. " +
      "Only create views when the user explicitly asks. " +
      "Filter keys match CRM columns: stage, status, type, industry, company_id, contact_id, deal_id. " +
      "For date ranges use column_after/column_before (e.g. due_date_before, close_date_after). " +
      "Use symbolic tokens for dynamic dates: $today, $week_start, $week_end, $month_start, $month_end.",
    inputSchema: z.discriminatedUnion("operation", [
      createInput,
      listInput,
      updateInput,
      deleteInput,
    ]),
    execute: async (input) => {
      switch (input.operation) {
        case "create": {
          const validationError = validateViewFilters(
            input.entity_type,
            input.filters,
            input.sort,
          );
          if (validationError) {
            return { success: false as const, error: validationError };
          }

          const { data, error } = await supabase
            .from("crm_views")
            .insert({
              client_id: clientId,
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
            distinctId: clientId,
            event: "crm_view_created",
            properties: { entity_type: input.entity_type, source: "agent" },
          });

          return { success: true as const, view: data };
        }

        case "list": {
          let query = supabase
            .from("crm_views")
            .select("*")
            .eq("client_id", clientId);

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
          const updates: Record<string, unknown> = {};
          if (input.name !== undefined) updates.name = input.name;
          if (input.filters !== undefined) updates.filters = input.filters;
          if (input.sort !== undefined) updates.sort = input.sort;

          if (Object.keys(updates).length === 0) {
            return { success: false as const, error: "No fields to update." };
          }

          // Validate filters/sort against entity whitelist
          if (input.filters || input.sort) {
            const { data: existing } = await supabase
              .from("crm_views")
              .select("entity_type")
              .eq("view_id", input.view_id)
              .eq("client_id", clientId)
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

          const { data, error } = await supabase
            .from("crm_views")
            .update(updates)
            .eq("view_id", input.view_id)
            .eq("client_id", clientId)
            .select()
            .single();

          if (error) {
            return { success: false as const, error: error.message };
          }

          return { success: true as const, view: data };
        }

        case "delete": {
          const { error } = await supabase
            .from("crm_views")
            .delete()
            .eq("view_id", input.view_id)
            .eq("client_id", clientId);

          if (error) {
            return { success: false as const, error: error.message };
          }

          await captureServerEvent({
            distinctId: clientId,
            event: "crm_view_deleted",
            properties: { source: "agent" },
          });

          return { success: true as const, deleted: true };
        }
      }
    },
  });

  return { manage_views };
}
