/**
 * CRM task tools for the runner.
 * @module lib/runner/tools/crm/tasks
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  buildCustomFieldsSchema,
  CRM_DEFAULTS,
  type CrmVocabConfig,
} from "@/lib/crm/config";
import { crmTaskStatusValues } from "@/lib/crm/schemas";
import type { Database, JsonObject } from "@/types/database";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

import { mergeCustomFields } from "./custom-fields";
import { flexibleTimestampSchema, normalizeDateString } from "./filter-utils";

/**
 * Creates CRM task create/update tools.
 *
 * Search and delete are handled by search_crm and delete_records respectively.
 */
type CrmTaskUpdate = Database["public"]["Tables"]["crm_tasks"]["Update"];

export function createTaskTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const create_task = tool({
    description:
      "Create a new CRM follow-up task. " +
      "Data Modification Warning: Only create tasks when the user has explicitly asked to do so.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Task title."),
      description: z.string().optional().describe("Task description."),
      status: z.enum(crmTaskStatusValues).optional().describe("Task status (open, completed). Defaults to 'open'."),
      due_date: flexibleTimestampSchema
        .optional()
        .describe("ISO-8601 due timestamp or YYYY-MM-DD date."),
      contact_id: z.string().uuid().optional().describe("UUID of the contact. Use search_crm to find this."),
      deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_crm to find this."),
      custom_fields: buildCustomFieldsSchema(config.task_custom_fields).optional()
        .describe("Configured task custom fields."),
    }),
    execute: async ({ title, description, status, due_date, contact_id, deal_id, custom_fields }) => {
      const normalizedDueDate = normalizeDateString(due_date) ?? null;

      const { data, error } = await supabase
        .from("crm_tasks")
        .insert({
          client_id: clientId,
          title,
          description: description ?? null,
          status: status ?? "open",
          due_date: normalizedDueDate,
          contact_id: contact_id ?? null,
          deal_id: deal_id ?? null,
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
          entity_type: "task",
          source: "agent",
        },
      });

      return {
        success: true as const,
        task: data,
      };
    },
  });

  const update_task = tool({
    description:
      "Update an existing CRM task by id. Use this after finding the task via search_crm. " +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update tasks when the user has explicitly asked to do so.",
    inputSchema: z.object({
      task_id: z.string().uuid().describe("UUID of the task to update. Use search_crm to find this."),
      title: z.string().min(1).optional().describe("Updated task title."),
      description: z.string().nullable().optional().describe("Updated task description or null."),
      status: z.enum(crmTaskStatusValues).optional().describe("Updated task status (open, completed)."),
      due_date: flexibleTimestampSchema
        .nullable()
        .optional()
        .describe("Updated due timestamp/date or null."),
      contact_id: z.string().uuid().nullable().optional().describe("Updated contact UUID or null. Use search_crm to find this."),
      deal_id: z.string().uuid().nullable().optional().describe("Updated deal UUID or null. Use search_crm to find this."),
      custom_fields: buildCustomFieldsSchema(config.task_custom_fields, "update").optional()
        .describe("Partial patch for configured task custom fields."),
    }),
    execute: async ({ task_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries({
          ...fields,
          due_date: normalizeDateString(fields.due_date),
        }).filter(([, value]) => value !== undefined),
      ) as CrmTaskUpdate;

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      if ("custom_fields" in updates) {
        const result = await mergeCustomFields(
          supabase, "crm_tasks", "task_id", task_id, clientId,
          (updates.custom_fields as JsonObject | undefined) ?? {},
        );
        if (result.error) return { success: false as const, error: result.error };
        updates.custom_fields = result.merged;
      }

      const { data, error } = await supabase
        .from("crm_tasks")
        .update(updates)
        .eq("task_id", task_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        task: data,
      };
    },
  });

  return {
    create_task,
    update_task,
  };
}
