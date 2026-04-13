/**
 * CRM task tools for managed agents.
 *
 * @module lib/managed-agents/tools/crm/tasks
 */
import { z } from "zod";

import { buildCustomFieldsSchema, CRM_DEFAULTS } from "@/lib/crm/config";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { crmTaskStatusValues } from "@/lib/crm/schemas";
import type { JsonObject } from "@/types/database";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

import { mergeCustomFields } from "@/lib/crm/custom-fields";
import { flexibleTimestampSchema, normalizeDateString } from "@/lib/crm/filter-utils";

import type { ManagedAgentTool } from "../types";

function validateTaskCustomFields(
  customFields: Record<string, unknown> | null | undefined,
  mode: "create" | "update",
  context: { crmConfig?: typeof CRM_DEFAULTS },
) {
  if (customFields === undefined) {
    return { success: true as const };
  }

  const schema = buildCustomFieldsSchema(
    context.crmConfig?.task_custom_fields ?? CRM_DEFAULTS.task_custom_fields,
    mode,
  );
  const parsed = schema.safeParse(customFields ?? {});

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid custom fields.";
    return { success: false as const, error: `Invalid task custom_fields: ${message}` };
  }

  return { success: true as const, value: parsed.data };
}

const createTaskInputSchema = z.object({
  title: z.string().min(1).describe("Task title."),
  description: z.string().optional().describe("Task description."),
  status: z.enum(crmTaskStatusValues).optional().describe("Task status (todo, in_progress, done). Defaults to 'todo'."),
  due_date: flexibleTimestampSchema.optional().describe("ISO-8601 due timestamp or YYYY-MM-DD date."),
  contact_id: z.string().uuid().optional().describe("UUID of the contact. Use search_crm to find this."),
  deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_crm to find this."),
  custom_fields: z.record(z.string(), z.unknown()).optional().describe("Configured task custom fields."),
});

const updateTaskInputSchema = z.object({
  task_id: z.string().uuid().describe("UUID of the task to update. Use search_crm to find this."),
  title: z.string().min(1).optional().describe("Updated task title."),
  description: z.string().nullable().optional().describe("Updated task description or null."),
  status: z.enum(crmTaskStatusValues).optional().describe("Updated task status (todo, in_progress, done)."),
  due_date: flexibleTimestampSchema.nullable().optional().describe("Updated due timestamp/date or null."),
  contact_id: z.string().uuid().nullable().optional().describe("Updated contact UUID or null. Use search_crm to find this."),
  deal_id: z.string().uuid().nullable().optional().describe("Updated deal UUID or null. Use search_crm to find this."),
  custom_fields: z.record(z.string(), z.unknown()).nullable().optional().describe("Partial patch for configured task custom fields."),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const createTaskTool: ManagedAgentTool<CreateTaskInput> = {
  name: "create_task",
  description:
    "Create a new CRM follow-up task. " +
    "Data Modification Warning: Only create tasks when the user has explicitly asked to do so.",
  inputSchema: createTaskInputSchema,
  execute: async ({ title, description, status, due_date, contact_id, deal_id, custom_fields }, context) => {
    const parsedCustomFields = validateTaskCustomFields(custom_fields, "create", context);
    if (!parsedCustomFields.success) {
      return { success: false as const, error: parsedCustomFields.error };
    }

    const normalizedDueDate = normalizeDateString(due_date) ?? null;

    const { data, error } = await context.supabase
      .from("crm_tasks")
      .insert({
        client_id: context.clientId,
        title,
        description: description ?? null,
        status: status ?? "todo",
        due_date: normalizedDueDate,
        contact_id: contact_id ?? null,
        deal_id: deal_id ?? null,
        custom_fields: parsedCustomFields.value ?? {},
      })
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    await captureServerEvent({
      distinctId: context.clientId,
      event: "crm_record_created",
      properties: {
        entity_type: "task",
        source: "agent",
      },
    });

    void captureTimelineActivity({
      supabase: context.supabase,
      clientId: context.clientId,
      recordType: "task",
      recordId: data.task_id,
      action: "created",
      actorType: "agent",
      after: data as Record<string, unknown>,
    });

    return {
      success: true as const,
      task: data,
    };
  },
};

export const updateTaskTool: ManagedAgentTool<UpdateTaskInput> = {
  name: "update_task",
  description:
    "Update an existing CRM task by id. Use this after finding the task via search_crm. " +
    "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
    "Data Modification Warning: Only update tasks when the user has explicitly asked to do so.",
  inputSchema: updateTaskInputSchema,
  execute: async ({ task_id, ...fields }, context) => {
    const parsedCustomFields = validateTaskCustomFields(
      (fields.custom_fields as Record<string, unknown> | null | undefined) ?? undefined,
      "update",
      context,
    );

    if (!parsedCustomFields.success) {
      return { success: false as const, error: parsedCustomFields.error };
    }

    const updates = Object.fromEntries(
      Object.entries({
        ...fields,
        due_date: normalizeDateString(fields.due_date),
        custom_fields: parsedCustomFields.success ? parsedCustomFields.value : undefined,
      }).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: "No fields to update" };
    }

    const { data: existingTask, error: readError } = await context.supabase
      .from("crm_tasks")
      .select("*")
      .eq("task_id", task_id)
      .eq("client_id", context.clientId)
      .maybeSingle();

    const beforeSnapshot = readError ? null : (existingTask as Record<string, unknown> | null);

    if ("custom_fields" in updates) {
      const result = await mergeCustomFields(
        context.supabase,
        "crm_tasks",
        "task_id",
        task_id,
        context.clientId,
        (updates.custom_fields as JsonObject | undefined) ?? {},
      );

      if (result.error) {
        return { success: false as const, error: result.error };
      }

      updates.custom_fields = result.merged;
    }

    const { data, error } = await context.supabase
      .from("crm_tasks")
      .update(updates)
      .eq("task_id", task_id)
      .eq("client_id", context.clientId)
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    if (beforeSnapshot) {
      void captureTimelineActivity({
        supabase: context.supabase,
        clientId: context.clientId,
        recordType: "task",
        recordId: task_id,
        action: "updated",
        actorType: "agent",
        before: beforeSnapshot,
        after: data as Record<string, unknown>,
      });
    }

    return {
      success: true as const,
      task: data,
    };
  },
};
