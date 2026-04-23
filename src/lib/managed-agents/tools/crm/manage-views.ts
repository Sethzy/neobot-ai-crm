/**
 * CRM saved view tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/manage-views
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { crmViewEntityTypes } from "@/lib/crm/schemas";
import { validateViewFilters, viewFiltersSchema } from "@/lib/crm/view-filters";
import {
  crmViewSortSchema,
  crmViewStatePatchSchema,
  normalizeCrmView,
  normalizeCrmViewState,
} from "@/lib/crm/view-state";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  operation: z.enum(["create", "list", "update", "delete"]).describe(
    "Which saved-view operation to perform.",
  ),
  name: z.string().min(1).optional().describe("Display name for create or update."),
  entity_type: z
    .enum(crmViewEntityTypes)
    .optional()
    .describe("CRM entity this view filters (contacts, companies, deals, tasks)."),
  state: crmViewStatePatchSchema
    .optional()
    .describe(
      "Optional saved workspace state for create or update. Supports viewType, filters, sort, columns, columnOrder, groupBy, calendarField, openMode, and isDefault.",
    ),
  filters: viewFiltersSchema
    .optional()
    .describe("Legacy compatibility field. When provided, it overrides state.filters."),
  sort: crmViewSortSchema.nullable().optional().describe(
    "Legacy compatibility field. When provided, it overrides state.sort.",
  ),
  view_id: z.string().uuid().optional().describe("UUID of the view to update or delete."),
});

type ManageViewsInput = z.infer<typeof inputSchema>;

function validateNextState(
  entityType: string,
  nextState: ManageViewsInput["state"],
  legacyFilters: ManageViewsInput["filters"],
  legacySort: ManageViewsInput["sort"],
) {
  const nextFilters =
    legacyFilters ?? nextState?.filters ?? {};
  const nextSort =
    legacySort !== undefined ? legacySort : nextState?.sort;

  return validateViewFilters(entityType, nextFilters, nextSort ?? null);
}

export const manageViewsTool: ManagedAgentTool<ManageViewsInput> = {
  name: "manage_views",
  description:
    "Create, list, update, or delete saved CRM views. " +
    "A view is a named saved workspace that can remember layout, filters, sort, columns, and record open behavior. " +
    "Only create views when the user explicitly asks. " +
    "Filter keys match CRM columns: stage, status, type, industry, company_id, contact_id, deal_id. " +
    "For date ranges use column_after/column_before (e.g. due_date_before, close_date_after). " +
    "Use symbolic tokens for dynamic dates: $today, $week_start, $week_end, $month_start, $month_end.",
  inputSchema,
  execute: async (input, context) => {
    switch (input.operation) {
      case "create": {
        if (!input.name || !input.entity_type || (!input.state && !input.filters)) {
          return {
            success: false as const,
            error: "create requires name, entity_type, and either state or filters.",
          };
        }

        const validationError = validateNextState(
          input.entity_type,
          input.state,
          input.filters,
          input.sort,
        );
        if (validationError) {
          return { success: false as const, error: validationError };
        }

        const state = normalizeCrmViewState({
          entityType: input.entity_type,
          state: {
            ...(input.state ?? {}),
            ...(input.filters !== undefined ? { filters: input.filters } : {}),
            ...(input.sort !== undefined ? { sort: input.sort } : {}),
          },
        });

        const { data, error } = await context.supabase
          .from("crm_views")
          .insert({
            client_id: context.clientId,
            name: input.name,
            entity_type: input.entity_type,
            filters: state.filters,
            sort: state.sort,
            state,
            is_default: state.isDefault,
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

        return { success: true as const, view: normalizeCrmView(data) };
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

        const views = (data ?? []).map((view) => normalizeCrmView(view));
        return { success: true as const, views, count: views.length };
      }

      case "update": {
        if (!input.view_id) {
          return { success: false as const, error: "update requires view_id." };
        }

        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) {
          updates.name = input.name;
        }
        const hasStateChanges =
          input.state !== undefined ||
          input.filters !== undefined ||
          input.sort !== undefined;

        if (Object.keys(updates).length === 0 && !hasStateChanges) {
          return { success: false as const, error: "No fields to update." };
        }

        if (hasStateChanges) {
          const { data: existing, error: existingError } = await context.supabase
            .from("crm_views")
            .select("entity_type, filters, sort, state, is_default")
            .eq("view_id", input.view_id)
            .eq("client_id", context.clientId)
            .single();

          if (existingError) {
            return { success: false as const, error: existingError.message };
          }

          if (!existing) {
            return { success: false as const, error: "View not found." };
          }

          const validationError = validateNextState(
            existing.entity_type,
            input.state,
            input.filters,
            input.sort,
          );
          if (validationError) {
            return { success: false as const, error: validationError };
          }

          const state = normalizeCrmViewState({
            entityType: existing.entity_type,
            state: {
              ...normalizeCrmViewState({
                entityType: existing.entity_type,
                state: existing.state,
                filters: existing.filters,
                sort: existing.sort,
                isDefault: existing.is_default,
              }),
              ...(input.state ?? {}),
              ...(input.filters !== undefined ? { filters: input.filters } : {}),
              ...(input.sort !== undefined ? { sort: input.sort } : {}),
            },
          });

          updates.filters = state.filters;
          updates.sort = state.sort;
          updates.state = state;
          updates.is_default = state.isDefault;
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

        return { success: true as const, view: normalizeCrmView(data) };
      }

      case "delete": {
        if (!input.view_id) {
          return { success: false as const, error: "delete requires view_id." };
        }

        const { data: deletedView, error } = await context.supabase
          .from("crm_views")
          .delete()
          .eq("view_id", input.view_id)
          .eq("client_id", context.clientId)
          .select("view_id")
          .maybeSingle();

        if (error) {
          return { success: false as const, error: error.message };
        }

        if (!deletedView) {
          return { success: false as const, error: "View not found." };
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
