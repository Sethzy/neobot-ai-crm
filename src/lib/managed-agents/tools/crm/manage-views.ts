/**
 * CRM saved view tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/manage-views
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { CRM_DEFAULTS, loadCrmConfig, type CrmVocabConfig } from "@/lib/crm/config";
import { crmViewEntityTypes } from "@/lib/crm/schemas";
import { validateViewFilters } from "@/lib/crm/view-filters";
import {
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
      "Saved workspace state for create or update. All keys are camelCase (NOT snake_case). " +
      "Fields: " +
      "viewType (one of: table, kanban, calendar), " +
      "filters (object of {filterKey: value}), " +
      "sort ({column, ascending} or null), " +
      "columns (string[] — field keys to show), " +
      "columnOrder (string[] — display order), " +
      "groupBy (string or null — field key to group by, used in kanban), " +
      "calendarField (string or null — date field to plot, used in calendar), " +
      "openMode (one of: drawer, page — how records open), " +
      "isDefault (boolean). " +
      "Unknown keys are rejected — do not use snake_case aliases like open_as or group_by.",
    ),
  view_id: z.string().uuid().optional().describe("UUID of the view to update or delete."),
});

type ManageViewsInput = z.infer<typeof inputSchema>;

function getCustomFilterKeysForEntity(
  entityType: string,
  config: CrmVocabConfig,
): string[] {
  switch (entityType) {
    case "contacts":
      return config.contact_custom_fields.map((field) => field.key);
    case "companies":
      return config.company_custom_fields.map((field) => field.key);
    case "deals":
      return config.deal_custom_fields.map((field) => field.key);
    case "tasks":
      return config.task_custom_fields.map((field) => field.key);
    default:
      return [];
  }
}

export const manageViewsTool: ManagedAgentTool<ManageViewsInput> = {
  name: "manage_views",
  description:
    "Create, list, update, or delete saved CRM views. " +
    "A view is a named saved workspace that can remember layout, filters, sort, columns, and record open behavior. " +
    "Only create views when the user explicitly asks. " +
    "Filter keys match CRM columns: stage, status, type, industry, company_id, contact_id, deal_id. " +
    "Configured custom field keys (from configure_crm) are ALSO valid filter keys — pass them by their `key` value, e.g. `qa_test_flag: \"true\"`. " +
    "For date ranges use column_after/column_before (e.g. due_date_before, close_date_after). " +
    "Use symbolic tokens for dynamic dates: $today, $week_start, $week_end, $month_start, $month_end.",
  inputSchema,
  execute: async (input, context) => {
    // Always re-read CRM config from the DB rather than using the
    // session-cached snapshot. configure_crm may have just added a custom
    // field earlier in the same run, and the cached config wouldn't include
    // it — causing valid filter keys to be rejected by validateViewFilters.
    const { config: freshConfig } = await loadCrmConfig(context.supabase, context.clientId);
    const config = freshConfig ?? context.crmConfig ?? CRM_DEFAULTS;

    switch (input.operation) {
      case "create": {
        if (!input.name || !input.entity_type || !input.state) {
          return {
            success: false as const,
            error: "create requires name, entity_type, and state.",
          };
        }

        const validationError = validateViewFilters(
          input.entity_type,
          input.state.filters ?? {},
          input.state.sort ?? null,
          { customFieldKeys: getCustomFilterKeysForEntity(input.entity_type, config) },
        );
        if (validationError) {
          return { success: false as const, error: validationError };
        }

        const state = normalizeCrmViewState({
          entityType: input.entity_type,
          state: input.state,
        });

        const { data, error } = await context.supabase
          .from("crm_views")
          .insert({
            client_id: context.clientId,
            name: input.name,
            entity_type: input.entity_type,
            state,
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

        if (input.state !== undefined) {
          const { data: existing, error: existingError } = await context.supabase
            .from("crm_views")
            .select("entity_type, state")
            .eq("view_id", input.view_id)
            .eq("client_id", context.clientId)
            .single();

          if (existingError) {
            return { success: false as const, error: existingError.message };
          }

          if (!existing) {
            return { success: false as const, error: "View not found." };
          }

          const existingState = normalizeCrmViewState({
            entityType: existing.entity_type,
            state: existing.state,
          });

          const mergedState = { ...existingState, ...input.state };

          const validationError = validateViewFilters(
            existing.entity_type,
            mergedState.filters ?? {},
            mergedState.sort ?? null,
            { customFieldKeys: getCustomFilterKeysForEntity(existing.entity_type, config) },
          );
          if (validationError) {
            return { success: false as const, error: validationError };
          }

          updates.state = normalizeCrmViewState({
            entityType: existing.entity_type,
            state: mergedState,
          });
        }

        if (Object.keys(updates).length === 0) {
          return { success: false as const, error: "No fields to update." };
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
