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

import { mergeCustomFields } from "./custom-fields";
import { buildSearchExpression, DEFAULT_CRM_RESULT_LIMIT, flexibleTimestampSchema, normalizeDateString } from "./filter-utils";

/**
 * Creates CRM task-related tools.
 *
 * These tools target `crm_tasks` (not `agent_tasks`).
 */
type CrmTaskUpdate = Database["public"]["Tables"]["crm_tasks"]["Update"];

export function createTaskTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const search_tasks = tool({
    description:
      "Search CRM tasks. Optionally filter by status, contact, or deal. " +
      "Results are sorted by due date (earliest first). " +
      "Use this to find tasks before updating them.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Free-text search on title and description."),
      status: z.enum(crmTaskStatusValues).optional().describe("Task status filter (open, completed)."),
      contact_id: z.string().uuid().optional().describe("Filter by contact UUID. Use search_contacts to find this."),
      deal_id: z.string().uuid().optional().describe("Filter by deal UUID. Use search_deals to find this."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, status, contact_id, deal_id, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
      let queryBuilder = supabase
        .from("crm_tasks")
        .select("*")
        .eq("client_id", clientId);

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, ["title", "description"]));
      }

      if (status) {
        queryBuilder = queryBuilder.eq("status", status);
      }

      if (contact_id) {
        queryBuilder = queryBuilder.eq("contact_id", contact_id);
      }

      if (deal_id) {
        queryBuilder = queryBuilder.eq("deal_id", deal_id);
      }

      const { data, error } = await queryBuilder
        .order("due_date", { ascending: true })
        .limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const tasks = data ?? [];

      return {
        success: true as const,
        tasks,
        count: tasks.length,
      };
    },
  });

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
      contact_id: z.string().uuid().optional().describe("UUID of the contact. Use search_contacts to find this."),
      deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_deals to find this."),
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

      return {
        success: true as const,
        task: data,
      };
    },
  });

  const update_task = tool({
    description:
      "Update an existing CRM task by id. Use this after finding the task via search_tasks. " +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update tasks when the user has explicitly asked to do so.",
    inputSchema: z.object({
      task_id: z.string().uuid().describe("UUID of the task to update. Use search_tasks to find this."),
      title: z.string().min(1).optional().describe("Updated task title."),
      description: z.string().nullable().optional().describe("Updated task description or null."),
      status: z.enum(crmTaskStatusValues).optional().describe("Updated task status (open, completed)."),
      due_date: flexibleTimestampSchema
        .nullable()
        .optional()
        .describe("Updated due timestamp/date or null."),
      contact_id: z.string().uuid().nullable().optional().describe("Updated contact UUID or null. Use search_contacts to find this."),
      deal_id: z.string().uuid().nullable().optional().describe("Updated deal UUID or null. Use search_deals to find this."),
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

  const delete_task = tool({
    description:
      "Permanently delete a CRM task by id. This cannot be undone. " +
      "Use search_tasks to find the task first.",
    inputSchema: z.object({
      task_id: z.string().uuid().describe("UUID of the task to delete."),
    }),
    execute: async ({ task_id }) => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .delete()
        .eq("task_id", task_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, task: data };
    },
  });

  return {
    search_tasks,
    create_task,
    update_task,
    delete_task,
  };
}
